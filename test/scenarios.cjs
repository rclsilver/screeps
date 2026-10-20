'use strict';

// Portable scenarios: Node's runner and other JavaScript hosts use the same cases.
const constants = {
  RESOURCE_ENERGY: 'energy', WORK: 'work', CARRY: 'carry', MOVE: 'move',
  BODYPART_COST: { work: 100, carry: 50, move: 50 }, CREEP_SPAWN_TIME: 3,
  OK: 0, ERR_NOT_IN_RANGE: -9, ERR_FULL: -8, ERR_RCL_NOT_ENOUGH: -14,
  STRUCTURE_SPAWN: 'spawn', STRUCTURE_EXTENSION: 'extension', STRUCTURE_TOWER: 'tower',
  STRUCTURE_CONTAINER: 'container', STRUCTURE_STORAGE: 'storage', STRUCTURE_ROAD: 'road',
  FIND_STRUCTURES: 1, FIND_SOURCES: 2, FIND_MY_CONSTRUCTION_SITES: 3,
  FIND_DROPPED_RESOURCES: 4, FIND_TOMBSTONES: 5, FIND_RUINS: 6,
  FIND_MINERALS: 7, FIND_HOSTILE_CREEPS: 8,
  LOOK_STRUCTURES: 'structures', LOOK_CONSTRUCTION_SITES: 'sites', TERRAIN_MASK_WALL: 1,
  CONTROLLER_STRUCTURES: { extension: { 1: 0, 2: 5, 3: 10 } }
};
function check(value, message) { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  check(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
function world() {
  const calls = [];
  const pos = (x, y) => ({ x, y,
    getRangeTo(target) { const p = target.pos || target; return Math.max(Math.abs(x - p.x), Math.abs(y - p.y)); },
    findClosestByRange(list) { return list.slice().sort((a, b) => this.getRangeTo(a) - this.getRangeTo(b))[0] || null; },
    findPathTo(tx, ty) { return [{ x: tx - 1, y: ty }]; }
  });
  const store = (used, capacity = 50) => ({ energy: used,
    getUsedCapacity() { return this.energy; }, getFreeCapacity() { return capacity - this.energy; } });
  const spawn = { id: 'spawn', my: true, structureType: 'spawn', pos: pos(14, 26), store: store(0, 300),
    spawnCreep(body, name, options) { calls.push(['spawn', body, name, options]); return 0; } };
  const objects = {
    1: [spawn], 2: [{ id: 's1', energy: 3000, pos: pos(6, 22) }, { id: 's2', energy: 3000, pos: pos(8, 28) }],
    3: [], 4: [], 5: [], 6: [], 7: [], 8: []
  };
  const sites = [];
  const room = { name: 'W2N2', energyAvailable: 200, energyCapacityAvailable: 300,
    controller: { my: true, level: 1, ticksToDowngrade: 15000, progress: 0, progressTotal: 200, pos: pos(26, 16) },
    find(type) { return objects[type] || []; }, getTerrain() { return { get() { return 0; } }; },
    lookForAt(type, x, y) { return sites.filter(s => s.x === x && s.y === y); },
    createConstructionSite(x, y, type) { calls.push(['site', x, y, type]); sites.push({ x, y }); return 0; }
  };
  const Memory = { creeps: {} };
  const Game = { rooms: { W2N2: room }, creeps: {}, time: 40,
    cpu: { getUsed: () => 1, bucket: 10000, limit: 100, tickLimit: 100 },
    getObjectById(id) { return Object.values(objects).flat().find(o => o.id === id) || null; } };
  function add(name, role = 'harvester', used = 0, ttl = 1000) {
    const creep = { name, memory: { role, home: room.name }, room, body: [{}, {}, {}],
      ticksToLive: ttl, store: store(used), pos: pos(13, 26), hits: 100, hitsMax: 100 };
    for (const method of ['harvest', 'transfer', 'withdraw', 'pickup', 'build', 'upgradeController', 'repair', 'moveTo']) {
      creep[method] = (...args) => { calls.push([name, method, args[0] && (args[0].id || args[0].name || 'controller'), args[1]]); return 0; };
    }
    Memory.creeps[name] = creep.memory;
    Game.creeps[name] = creep;
    return creep;
  }
  return { globals: { ...constants, Game, Memory, console: { log() {} } }, Game, Memory, room, objects, spawn, calls, add, store, pos };
}
const scenarios = [
  ['never spawn below 200 energy', load => {
    const w = world(); w.room.energyAvailable = 199; load(w.globals).loop();
    check(!w.calls.some(c => c[0] === 'spawn'), 'Spawn should wait'); equal(w.Memory.colony.errors, 0, 'No errors');
  }],
  ['empty colony restarts at exactly 200 even with large capacity', load => {
    const w = world(); w.room.energyCapacityAvailable = 800; load(w.globals).loop();
    const call = w.calls.find(c => c[0] === 'spawn');
    check(call, 'Emergency creep required'); equal(call[1], ['work', 'carry', 'move'], 'Affordable body');
  }],
  ['do not duplicate an already spawning emergency worker', load => {
    const w = world(); w.add('h1'); w.add('h2').spawning = true; load(w.globals).loop();
    check(!w.calls.some(c => c[0] === 'spawn'), 'Save for upgrader rather than another emergency harvester');
    equal(w.Memory.colony.rooms.W2N2.spawn.role, 'upgrader', 'Upgrade starts after two harvesters');
  }],
  ['replace dying harvesters before they disappear', load => {
    const w = world(); w.add('old', 'harvester', 0, 20); w.add('healthy'); load(w.globals).loop();
    const call = w.calls.find(c => c[0] === 'spawn'); check(call, 'Replacement required');
    equal(call[3].memory.role, 'harvester', 'Replacement role');
  }],
  ['harvester delivery prioritizes spawn over construction', load => {
    const w = world(); w.add('h', 'harvester', 50); w.objects[3].push({ id: 'site', pos: w.pos(14, 26) });
    load(w.globals).loop(); check(w.calls.some(c => c[0] === 'h' && c[1] === 'transfer' && c[2] === 'spawn' && c[3] === 'energy'), 'Deliver energy');
    check(!w.calls.some(c => c[0] === 'h' && c[1] === 'build'), 'Keep spawn supplied first');
  }],
  ['upgrader saves spawn when every harvester is gone', load => {
    const w = world(); w.add('u', 'upgrader', 50); load(w.globals).loop();
    check(w.calls.some(c => c[0] === 'u' && c[1] === 'transfer'), 'Recovery delivery required');
  }],
  ['critical controller receives energy before other work', load => {
    const w = world(); w.add('h', 'harvester', 50); w.room.controller.ticksToDowngrade = 100;
    load(w.globals).loop(); check(w.calls.some(c => c[0] === 'h' && c[1] === 'upgradeController'), 'Prevent downgrade');
  }],
  ['retain old source assignments during migration', load => {
    const w = world(); const h = w.add('h'); h.memory.source = 's2'; load(w.globals).loop();
    equal(h.memory.sourceId, 's2', 'Source migrated'); check(w.calls.some(c => c[0] === 'h' && c[1] === 'harvest' && c[2] === 's2'), 'Same source harvested');
  }],
  ['assign new workers across both sources', load => {
    const w = world(); w.add('a').memory.sourceId = 's1'; const b = w.add('b'); load(w.globals).loop();
    equal(b.memory.sourceId, 's2', 'Less crowded source');
  }],
  ['recover energy from tombstones without draining spawn', load => {
    const w = world(); w.add('h'); w.objects[5].push({ id: 'tomb', store: w.store(50), pos: w.pos(13, 26) });
    load(w.globals).loop(); check(w.calls.some(c => c[0] === 'h' && c[1] === 'withdraw' && c[2] === 'tomb'), 'Use recovered energy');
  }],
  ['builder builds and surplus harvester upgrades', load => {
    const w = world(); w.spawn.store.energy = 300; w.add('b', 'builder', 50); w.add('h', 'harvester', 50);
    w.objects[3].push({ id: 'site', pos: w.pos(15, 26) }); load(w.globals).loop();
    check(w.calls.some(c => c[0] === 'b' && c[1] === 'build'), 'Construction required');
    w.objects[3] = []; w.calls.length = 0; load(w.globals).loop();
    check(w.calls.some(c => c[0] === 'h' && c[1] === 'upgradeController'), 'No idle surplus worker');
  }],
  ['extension planner respects RCL limit and three-site cap', load => {
    const w = world(); w.Game.time = 50; w.room.controller.level = 2;
    for (let i = 0; i < 4; i++) w.objects[1].push({ my: true, structureType: 'extension', pos: w.pos(10, 20 + i), store: w.store(50) });
    load(w.globals).loop(); equal(w.calls.filter(c => c[0] === 'site').length, 1, 'Only remaining extension slot');
    const v = world(); v.Game.time = 50; v.room.controller.level = 2; load(v.globals).loop();
    equal(v.calls.filter(c => c[0] === 'site').length, 3, 'Three sites maximum');
  }],
  ['avoid placing extensions with no access path', load => {
    const w = world(); w.Game.time = 50; w.room.controller.level = 2; w.spawn.pos.findPathTo = () => [];
    load(w.globals).loop(); check(!w.calls.some(c => c[0] === 'site'), 'Unreachable sites rejected');
  }],
  ['one creep error does not stop its peers; clean dead memory', load => {
    const w = world(); w.add('bad').harvest = () => { throw new Error('scenario failure'); }; w.add('good');
    w.Memory.creeps.dead = {}; load(w.globals).loop();
    equal(w.Memory.colony.errors, 1, 'Record error'); check(w.calls.some(c => c[0] === 'good' && c[1] === 'harvest'), 'Continue peers');
    check(!w.Memory.creeps.dead, 'Dead memory removed');
  }],
  ['respect CPU headroom', load => {
    const w = world(); w.add('h'); w.Game.cpu.getUsed = () => 90; load(w.globals).loop();
    check(!w.calls.some(c => c[0] === 'h'), 'Skip workers above CPU threshold');
  }],
  ['generated bodies always fit their energy budget', load => {
    const w = world(); const main = load(w.globals);
    for (let budget = 0; budget <= 800; budget++) {
      const body = main.bodyFor(budget);
      if (budget < 200) equal(body, null, 'Unaffordable budget');
      else { check(body.includes('work') && body.includes('carry') && body.includes('move'), 'Functional worker');
        check(body.reduce((sum, p) => sum + constants.BODYPART_COST[p], 0) <= budget, 'Affordable worker'); }
    }
  }]
];
module.exports = scenarios;
