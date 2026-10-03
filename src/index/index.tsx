import React from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import AppRoot from './app/AppRoot';
import { installAgentSurfaceNavigationReporter } from './app/agentSurfaceNavigation';

installAgentSurfaceNavigationReporter();
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<AppRoot />);
