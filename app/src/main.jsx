import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../design/tokens.css';
import '../../design/components.css';
import './app.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>,
);
