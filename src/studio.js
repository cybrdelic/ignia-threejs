'use strict';
window.PYRE2Studio = (() => {
  const $ = id => document.getElementById(id);
  function beforeStep() {}
  function install(app) {
    const f = app.flow;
    if ($('collider')) $('collider').onchange = e => { f.obstacle = +e.target.value; f.tick++; };
    if ($('pilot')) $('pilot').onchange = e => { f.ignition = e.target.checked ? 1 : 0; };
    if ($('vorticity')) $('vorticity').oninput = e => {
      f.vorticity = +e.target.value;
      if ($('vorticityValue')) $('vorticityValue').textContent = f.vorticity.toFixed(2);
    };
    if ($('slice')) $('slice').oninput = e => {
      app.render.slice = +e.target.value;
      if ($('sliceValue')) $('sliceValue').textContent = app.render.slice.toFixed(2) + ' m';
    };
    if ($('cut')) $('cut').onclick = () => {
      f.fuel = 0;
      if ($('fuel')) $('fuel').value = 0;
      if ($('fuelValue')) $('fuelValue').textContent = '0.00';
      if ($('status')) $('status').textContent = 'Fuel input = 0. Transported fields remain in the solver.';
    };
    app.inspect = () => app.info();
  }
  return { install, beforeStep };
})();
