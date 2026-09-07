'use strict';
// CI-only reduced field allocation. Production tiers are unchanged.
(() => {
  if (!new URLSearchParams(location.search).has('ci')) return;
  const original = ReactiveFlow.prototype.configure;
  ReactiveFlow.prototype.configure = function(tier) {
    if (tier !== 'ci') return original.call(this, tier);
    this.tier = 'draft';
    this.grid = [20,32,20];
    this.size = [3.2,4.8,3.2];
    this.tiles = 8;
    this.w = this.grid[0] * this.tiles;
    this.h = this.grid[1] * Math.ceil(this.grid[2] / this.tiles);
    for (const t of this.targets || []) this.gpu.destroy(t);
    this.state = [this.gpu.target(this.w,this.h,2),this.gpu.target(this.w,this.h,2),this.gpu.target(this.w,this.h,2)];
    this.curlTex = this.gpu.target(this.w,this.h);
    this.divTex = this.gpu.target(this.w,this.h);
    this.pressure = [this.gpu.target(this.w,this.h),this.gpu.target(this.w,this.h)];
    this.coarseGrid = this.grid.map(n => n / 2);
    this.cw = this.coarseGrid[0] * 8;
    this.ch = this.coarseGrid[1] * Math.ceil(this.coarseGrid[2] / 8);
    this.residualTex = this.gpu.target(this.w,this.h);
    this.coarseD = this.gpu.target(this.cw,this.ch);
    this.coarseP = [this.gpu.target(this.cw,this.ch),this.gpu.target(this.cw,this.ch)];
    this.targets = [...this.state,this.curlTex,this.divTex,...this.pressure,this.residualTex,this.coarseD,...this.coarseP];
    this.multigrid = true;
    this.pressureIterations = 6;
    this.reset();
  };
})();
