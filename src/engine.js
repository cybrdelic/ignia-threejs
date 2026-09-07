'use strict';
(async () => {
  const statusNode = document.getElementById('status');
  const files = [
    'src/engine-gpu.js',
    'src/engine-flow-core.js',
    'src/ci-smoke.js',
    'src/engine-shaders-material.js',
    'src/engine-shaders-render.js',
    'src/engine-renderer.js',
    'src/engine-main.js'
  ];
  for (const src of files) {
    if (statusNode) statusNode.textContent = `Loading ${src.split('/').pop()}…`;
    await new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }
})().catch(error => {
  console.error(error);
  window.PYRE_ERROR = error.stack || String(error);
  const statusNode = document.getElementById('status');
  if (statusNode) statusNode.textContent = error.message || String(error);
  document.body.classList.add('error');
});
