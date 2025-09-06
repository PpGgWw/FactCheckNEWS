import React from 'react';
import { createRoot } from 'react-dom/client';
import Panel from './Panel';
import './tailwind.css';

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<Panel />);
