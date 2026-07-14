import { Billboard } from "@react-three/drei";
import type { ObjectData } from "../schema/game";
import { hasMeshModel } from "../utils/meshModel";
import {
  DECAL_KIND_PRESETS,
  resolveObjectMaterial,
} from "../utils/objectMaterials";
import { getObjectFootprint } from "../utils/objectFootprint";
import { ObjectModelRenderer } from "./ObjectRenderers";

export const ALDERAMONTICO_MATERIALS = [
  { name: "Black Stone", color: "#100D14" },
  { name: "Old Marble", color: "#D8D1C8" },
  { name: "Marble Light", color: "#F4EFE7" },
  { name: "Grid Glass", color: "#70E8FF" },
  { name: "Blood", color: "#8A0006" },
  { name: "Church Gold", color: "#F3B341" },
  { name: "Black Soil", color: "#1F1815" },
  { name: "River Teal", color: "#237C86" },
  { name: "Dead Wood", color: "#4D382D" },
  { name: "Robe Purple", color: "#4100C2" },
];

export function FootprintOverlay({
  object,
  y = 0.012,
}: {
  object: ObjectData;
  y?: number;
}) {
  const isBlocking = object.collision?.profile !== "none";

  return (
    <group>
      {getObjectFootprint(object).map(([x, z]) => (
        <mesh
          key={`${x}_${z}`}
          position={[x, y, z]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <planeGeometry args={[0.92, 0.92]} />
          <meshBasicMaterial
            color={isBlocking ? "#EBCB8B" : "#70E8FF"}
            transparent
            opacity={isBlocking ? 0.22 : 0.14}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export function ScaleReference({
  x = 1.6,
  z = 0,
}: {
  x?: number;
  z?: number;
}) {
  return (
    <group position={[x, 0, z]}>
      <Billboard position={[0, 0.5, 0]}>
        <mesh>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color="#4100C2" transparent opacity={0.24} />
        </mesh>
      </Billboard>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.32, 0.4, 16]} />
        <meshBasicMaterial color="#70E8FF" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

export function ObjectPreviewScene({
  object,
  showFootprint = true,
  showScale = true,
}: {
  object: ObjectData;
  showFootprint?: boolean;
  showScale?: boolean;
}) {
  const footprint = getObjectFootprint(object);
  const maxX = Math.max(0, ...footprint.map(([x]) => x));
  const scaleX = Math.max(maxX + 1.35, (object.bounds?.[0] || 1) / 2 + 1.1);

  return (
    <group>
      {showFootprint && <FootprintOverlay object={object} />}
      <ObjectModelRenderer object={object} />
      {showScale && <ScaleReference x={scaleX} />}
    </group>
  );
}

type IsoSurface = {
  points: [number, number, number][];
  color: string;
  opacity: number;
  emissive: boolean;
  shade: number;
  order: number;
};

const shadeColor = (color: string, shade: number) => {
  const clean = color.startsWith("#") ? color.slice(1) : color;
  const value = Number.parseInt(clean.length === 3 ? clean.repeat(2) : clean, 16);
  if (!Number.isFinite(value)) return color;

  const r = Math.max(0, Math.min(255, Math.round(((value >> 16) & 255) * shade)));
  const g = Math.max(0, Math.min(255, Math.round(((value >> 8) & 255) * shade)));
  const b = Math.max(0, Math.min(255, Math.round((value & 255) * shade)));
  return `rgb(${r}, ${g}, ${b})`;
};

const projectIso = ([x, y, z]: [number, number, number]) => ({
  x: (x - z) * 48,
  y: (x + z) * 18 - y * 52,
});

const boxSurfacesForPart = (part: ObjectData["parts"][number]): IsoSurface[] => {
  const [x, y, z] = part.position;
  const [w, h, d] = part.size;
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;
  const material = resolveObjectMaterial(null, part.material);
  const color = material.color;
  const corners: Record<string, [number, number, number]> = {
    lbf: [x - hw, y - hh, z + hd],
    rbf: [x + hw, y - hh, z + hd],
    rbb: [x + hw, y - hh, z - hd],
    lbb: [x - hw, y - hh, z - hd],
    ltf: [x - hw, y + hh, z + hd],
    rtf: [x + hw, y + hh, z + hd],
    rtb: [x + hw, y + hh, z - hd],
    ltb: [x - hw, y + hh, z - hd],
  };

  return [
    {
      points: [corners.ltf, corners.rtf, corners.rtb, corners.ltb],
      color,
      opacity: material.opacity,
      emissive: material.emissiveIntensity > 0,
      shade: 1.18,
      order: x + y + z + 2,
    },
    {
      points: [corners.rtf, corners.rbf, corners.rbb, corners.rtb],
      color,
      opacity: material.opacity,
      emissive: material.emissiveIntensity > 0,
      shade: 0.86,
      order: x + y + z + 1,
    },
    {
      points: [corners.ltf, corners.lbf, corners.rbf, corners.rtf],
      color,
      opacity: material.opacity,
      emissive: material.emissiveIntensity > 0,
      shade: 0.68,
      order: x + y + z,
    },
  ];
};

const getObjectSurfaces = (object: ObjectData): IsoSurface[] => {
  if (hasMeshModel(object) && object.mesh) {
    return object.mesh.faces.map((face, index) => {
      const material = resolveObjectMaterial(object, face.material);
      return {
        points: face.vertices.map(
          (vertexId) => object.mesh?.vertices[vertexId] || [0, 0, 0],
        ) as [number, number, number][],
        color: material.color,
        opacity: material.opacity,
        emissive: material.emissiveIntensity > 0,
        shade: face.normal?.[1] && face.normal[1] > 0.5 ? 1.15 : 0.82,
        order: index,
      };
    });
  }

  return object.parts.flatMap((part) => {
    const material = resolveObjectMaterial(object, part.material);
    return boxSurfacesForPart({
      ...part,
      material: material.id,
    }).map((surface) => ({
      ...surface,
      color: material.color,
      opacity: material.opacity,
      emissive: material.emissiveIntensity > 0,
    }));
  });
};

export function ObjectSvgThumbnail({ object }: { object: ObjectData }) {
  const footprint = getObjectFootprint(object);
  const surfaces = getObjectSurfaces(object).sort((a, b) => a.order - b.order);
  const projected = surfaces.flatMap((surface) =>
    surface.points.map((point) => projectIso(point)),
  );
  const minX = Math.min(-90, ...projected.map((point) => point.x));
  const maxX = Math.max(90, ...projected.map((point) => point.x));
  const minY = Math.min(-100, ...projected.map((point) => point.y));
  const maxY = Math.max(60, ...projected.map((point) => point.y));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const scale = Math.min(1.25, 230 / width, 130 / height);
  const offsetX = 160 - ((minX + maxX) / 2) * scale;
  const offsetY = 92 - ((minY + maxY) / 2) * scale;
  const blocking = object.collision?.profile !== "none";

  const toPoints = (points: [number, number, number][]) =>
    points
      .map((point) => {
        const projectedPoint = projectIso(point);
        return `${projectedPoint.x * scale + offsetX},${projectedPoint.y * scale + offsetY}`;
      })
      .join(" ");

  return (
    <svg
      viewBox="0 0 320 180"
      role="img"
      aria-label={`${object.display_name} preview`}
      className="w-full h-full block bg-neutral-950"
    >
      <rect width="320" height="180" fill="#111111" />
      <g opacity="0.45">
        {footprint.map(([x, z]) => {
          const cx = 46 + (x - z) * 12;
          const cy = 142 + (x + z) * 6;
          return (
            <polygon
              key={`${x}_${z}`}
              points={`${cx},${cy - 7} ${cx + 14},${cy} ${cx},${cy + 7} ${cx - 14},${cy}`}
              fill={blocking ? "#EBCB8B" : "#70E8FF"}
              opacity={blocking ? 0.45 : 0.32}
              stroke="#E5E9F0"
              strokeOpacity="0.3"
            />
          );
        })}
      </g>
      <g>
        {surfaces.map((surface, index) => (
          <polygon
            key={`${surface.color}_${index}`}
            points={toPoints(surface.points)}
            fill={shadeColor(surface.color, surface.shade)}
            opacity={surface.opacity}
            stroke="#E5E9F0"
            strokeOpacity={surface.emissive ? "0.5" : "0.22"}
            strokeWidth="1"
          />
        ))}
      </g>
      <g>
        {(object.decals || []).map((decal) => {
          const preset = DECAL_KIND_PRESETS[decal.kind];
          const projectedPoint = projectIso([
            decal.position[0],
            decal.position[1],
            decal.position[2],
          ]);
          const cx = projectedPoint.x * scale + offsetX;
          const cy = projectedPoint.y * scale + offsetY;
          const color = decal.color || preset.color;
          const opacity = Math.max(0.05, Math.min(1, decal.opacity ?? preset.opacity));
          const width = Math.max(5, (decal.size?.[0] || 0.5) * 34 * scale);
          const height = Math.max(3, (decal.size?.[1] || 0.5) * 20 * scale);

          if (decal.kind === "crack" || decal.kind === "marble_vein") {
            return (
              <path
                key={decal.id}
                d={`M ${cx - width / 2} ${cy} C ${cx - width / 4} ${cy - height} ${cx + width / 4} ${cy + height} ${cx + width / 2} ${cy - height / 2}`}
                fill="none"
                stroke={color}
                strokeWidth={decal.kind === "crack" ? 3 : 2}
                strokeOpacity={opacity}
                strokeLinecap="round"
              />
            );
          }

          if (decal.kind === "grid_glow") {
            return (
              <g key={decal.id} opacity={opacity}>
                <rect
                  x={cx - width / 2}
                  y={cy - height / 2}
                  width={width}
                  height={height}
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                />
                <line x1={cx} y1={cy - height / 2} x2={cx} y2={cy + height / 2} stroke={color} />
                <line x1={cx - width / 2} y1={cy} x2={cx + width / 2} y2={cy} stroke={color} />
              </g>
            );
          }

          return (
            <ellipse
              key={decal.id}
              cx={cx}
              cy={cy}
              rx={width / 2}
              ry={height / 2}
              fill={color}
              opacity={opacity}
            />
          );
        })}
      </g>
      <g opacity="0.5">
        <rect x="260" y="76" width="22" height="48" fill="#4100C2" opacity="0.45" />
        <ellipse
          cx="271"
          cy="130"
          rx="17"
          ry="8"
          fill="none"
          stroke="#70E8FF"
          strokeWidth="3"
        />
      </g>
    </svg>
  );
}
