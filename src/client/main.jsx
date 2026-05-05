import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app.jsx';

// React 18 createRoot
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);