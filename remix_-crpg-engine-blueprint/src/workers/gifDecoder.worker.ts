import { decompressFrames, parseGIF } from "gifuct-js";

type DecodeRequest = {
  id: number;
  buffer: ArrayBuffer;
  maxFrameHeight: number;
  minFrameDuration: number;
};

type Capture = {
  frameIndex: number;
  duration: number;
};

const buildCaptures = (
  frames: ReturnType<typeof decompressFrames>,
  minFrameDuration: number,
): Capture[] => {
  if (frames.length === 0) return [];
  const captures: Capture[] = [
    {
      frameIndex: 0,
      duration: Math.max(20, frames[0].delay || 100),
    },
  ];
  let accumulatedDuration = 0;
  for (let index = 1; index < frames.length; index += 1) {
    accumulatedDuration += Math.max(20, frames[index].delay || 100);
    if (
      accumulatedDuration >= minFrameDuration ||
      index === frames.length - 1
    ) {
      captures.push({ frameIndex: index, duration: accumulatedDuration });
      accumulatedDuration = 0;
    }
  }
  return captures;
};

const applyPreviousDisposal = (
  context: OffscreenCanvasRenderingContext2D,
  previous: ReturnType<typeof decompressFrames>[number] | undefined,
  restoreSnapshot: ImageData | undefined,
) => {
  if (previous?.disposalType === 2) {
    context.clearRect(
      previous.dims.left,
      previous.dims.top,
      previous.dims.width,
      previous.dims.height,
    );
  } else if (previous?.disposalType === 3 && restoreSnapshot) {
    context.putImageData(restoreSnapshot, 0, 0);
  }
};

self.onmessage = (event: MessageEvent<DecodeRequest>) => {
  const { id, buffer, maxFrameHeight, minFrameDuration } = event.data;
  try {
    const parsed = parseGIF(buffer);
    const frames = decompressFrames(parsed, true);
    const sourceWidth = Math.max(1, parsed.lsd.width);
    const sourceHeight = Math.max(1, parsed.lsd.height);
    const captures = buildCaptures(frames, Math.max(40, minFrameDuration));
    if (captures.length === 0) throw new Error("GIF contains no frames");

    const frameHeight = Math.min(sourceHeight, Math.max(32, maxFrameHeight));
    const frameWidth = Math.max(
      1,
      Math.round(sourceWidth * (frameHeight / sourceHeight)),
    );
    const padding = 1;
    const cellWidth = frameWidth + padding * 2;
    const cellHeight = frameHeight + padding * 2;
    const idealColumns = Math.max(
      1,
      Math.ceil(
        Math.sqrt((captures.length * cellHeight) / Math.max(1, cellWidth)),
      ),
    );
    const maxColumns = Math.max(1, Math.floor(4096 / cellWidth));
    const columns = Math.min(idealColumns, maxColumns);
    const rows = Math.ceil(captures.length / columns);
    if (rows * cellHeight > 4096) {
      throw new Error("Animated sprite atlas exceeds the 4096px texture limit");
    }

    const atlasWidth = columns * cellWidth;
    const atlasHeight = rows * cellHeight;
    const sourceCanvas = new OffscreenCanvas(sourceWidth, sourceHeight);
    const sourceContext = sourceCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    const patchCanvas = new OffscreenCanvas(sourceWidth, sourceHeight);
    const patchContext = patchCanvas.getContext("2d");
    const atlasCanvas = new OffscreenCanvas(atlasWidth, atlasHeight);
    const atlasContext = atlasCanvas.getContext("2d");
    if (!sourceContext || !patchContext || !atlasContext) {
      throw new Error("Offscreen canvas is unavailable for GIF decoding");
    }
    sourceContext.imageSmoothingEnabled = true;
    atlasContext.imageSmoothingEnabled = true;
    atlasContext.imageSmoothingQuality = "high";

    const captureByFrame = new Map(
      captures.map((capture, captureIndex) => [capture.frameIndex, captureIndex]),
    );
    let previousFrame: (typeof frames)[number] | undefined;
    let restoreSnapshot: ImageData | undefined;

    frames.forEach((frame, frameIndex) => {
      if (frameIndex === 0) {
        sourceContext.clearRect(0, 0, sourceWidth, sourceHeight);
      } else {
        applyPreviousDisposal(sourceContext, previousFrame, restoreSnapshot);
        if (previousFrame?.disposalType === 3) restoreSnapshot = undefined;
      }

      if (frame.disposalType === 3) {
        restoreSnapshot = sourceContext.getImageData(
          0,
          0,
          sourceWidth,
          sourceHeight,
        );
      }
      patchContext.clearRect(0, 0, sourceWidth, sourceHeight);
      patchContext.putImageData(
        new ImageData(frame.patch, frame.dims.width, frame.dims.height),
        0,
        0,
      );
      sourceContext.drawImage(
        patchCanvas,
        0,
        0,
        frame.dims.width,
        frame.dims.height,
        frame.dims.left,
        frame.dims.top,
        frame.dims.width,
        frame.dims.height,
      );

      const captureIndex = captureByFrame.get(frameIndex);
      if (captureIndex !== undefined) {
        const column = captureIndex % columns;
        const row = Math.floor(captureIndex / columns);
        atlasContext.drawImage(
          sourceCanvas,
          column * cellWidth + padding,
          row * cellHeight + padding,
          frameWidth,
          frameHeight,
        );
      }
      previousFrame = frame;
    });

    const bitmap = atlasCanvas.transferToImageBitmap();
    self.postMessage(
      {
        id,
        sourceWidth,
        sourceHeight,
        atlasWidth,
        atlasHeight,
        frameWidth,
        frameHeight,
        cellWidth,
        cellHeight,
        padding,
        columns,
        rows,
        durations: captures.map((capture) => capture.duration),
        bitmap,
      },
      { transfer: [bitmap] },
    );
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export {};
