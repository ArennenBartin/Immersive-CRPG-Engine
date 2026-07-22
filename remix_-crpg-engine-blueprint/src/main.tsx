import {createRoot} from 'react-dom/client';
import {installAssetBase} from './utils/assetBase';
import App from './App.tsx';
import './index.css';

// Must run before any asset is requested so sub-path deploys resolve correctly.
installAssetBase();

// Play is a continuously updating simulation, not a form-only React surface.
// Development StrictMode intentionally invokes render/effect work twice; on
// the full 3D runtime that made the localhost engine perform materially worse
// than the production build and obscured real profiling. Runtime invariants
// are covered by the engine and browser regression suites instead.
createRoot(document.getElementById('root')!).render(<App />);
