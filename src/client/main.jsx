import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app.jsx';

// Using React 18's createRoot API
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);