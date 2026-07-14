import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {installAssetBase} from './utils/assetBase';
import App from './App.tsx';
import './index.css';

// Must run before any asset is requested so sub-path deploys resolve correctly.
installAssetBase();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
