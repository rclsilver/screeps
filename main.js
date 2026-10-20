'use strict';

// This is the only game module. Steam synchronizes it directly to default/main.
const VERSION = '0.2.0';
const ROLES = ['harvester', 'upgrader', 'builder'];

function energy(creep) { return creep.store.getUsedCapacity(RESOURCE_ENERGY); }
function free(target) { return target.store.getFreeCapacity(RESOURCE_ENERGY); }
function go(creep, target, range) {
  return creep.moveTo(target, { range: range === undefined ? 1 : range, reusePath: 10,
    maxRooms: 1, visualizePathStyle: { stroke: '#aabbcc', opacity: 0.25 } });
}
function act(creep, method, target, range) {
  const result = creep[method](target, ...(method === 'transfer' || method === 'withdraw' ? [RESOURCE_ENERGY] : []));
  if (result === ERR_NOT_IN_RANGE) go(creep, target, range);
  return result;
}
function closest(creep, targets) { return creep.pos.findClosestByRange(targets); }
function roomCreeps(room) {
  return Object.values(Game.creeps).filter(c => c.memory.home === room.name);
}
function sourceFor(creep, sources, creeps) {
  let source = Game.getObjectById(creep.memory.sourceId || creep.memory.source);
  if (source) creep.memory.sourceId = source.id;
  if (source && sources.some(s => s.id === source.id)) return source;
  const loads = {};
  for (const other of creeps) {
    const sourceId = other.memory.sourceId || other.memory.source;
    if (other.name !== creep.name && sourceId) {
      loads[sourceId] = (loads[sourceId] || 0) + 1;
    }
  }
  source = sources.slice().sort((a, b) =>
    (loads[a.id] || 0) - (loads[b.id] || 0) || creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b))[0];
  if (source) creep.memory.sourceId = source.id;
  return source;
}
function gather(creep, context) {
  const drops = context.drops.filter(d => d.amount >= 20);
  const piles = context.stores.filter(s => energy(s) > 0);
  const drop = closest(creep, drops);
  if (drop && creep.pos.getRangeTo(drop) <= 4) return act(creep, 'pickup', drop);
  const pile = closest(creep, piles);
  if (pile) return act(creep, 'withdraw', pile);
  const source = sourceFor(creep, context.sources, context.creeps);
  if (source && source.energy > 0) return act(creep, 'harvest', source);
  // Sources can empty before regeneration; keep assignment, collect nearby leftovers.
  if (drop) return act(creep, 'pickup', drop);
}
function upgrade(creep) {
  const controller = creep.room.controller;
  if (controller && controller.my) act(creep, 'upgradeController', controller, 3);
}
function work(creep, context) {
  if (creep.spawning) return;
  if (!ROLES.includes(creep.memory.role)) creep.memory.role = 'harvester';
  if (energy(creep) === 0) creep.memory.working = false;
  if (free(creep) === 0) creep.memory.working = true;
  if (!creep.memory.working) return gather(creep, context);
  const controller = creep.room.controller;
  if (controller && controller.my && controller.ticksToDowngrade < 4000) return upgrade(creep);
  const consumers = context.structures.filter(s =>
    (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.my && free(s) > 0);
  // All roles can restart a starved colony; don't withdraw from spawn/extensions.
  if (consumers.length && (creep.memory.role === 'harvester' || context.harvesters === 0)) {
    return act(creep, 'transfer', closest(creep, consumers));
  }
  if (creep.memory.role === 'harvester') {
    const towers = context.structures.filter(s => s.my && s.structureType === STRUCTURE_TOWER && free(s) > 0);
    if (towers.length) return act(creep, 'transfer', closest(creep, towers));
  }
  if (creep.memory.role !== 'upgrader') {
    const site = closest(creep, context.sites);
    if (site) return act(creep, 'build', site, 3);
    const damaged = closest(creep, context.structures.filter(s =>
      [STRUCTURE_CONTAINER, STRUCTURE_ROAD].includes(s.structureType) && s.hits < s.hitsMax * 0.4));
    if (damaged) return act(creep, 'repair', damaged, 3);
  }
  upgrade(creep);
}
function bodyFor(budget) {
  if (budget < 200) return null;
  // Small balanced bodies remain useful before all extensions are built.
  const body = [WORK, CARRY, MOVE];
  let cost = 200;
  const additions = [[WORK, MOVE], [CARRY, MOVE], [WORK, CARRY, MOVE], [WORK, CARRY, MOVE]];
  for (const parts of additions) {
    const price = parts.reduce((sum, p) => sum + BODYPART_COST[p], 0);
    if (cost + price > budget) break;
    body.push(...parts);
    cost += price;
  }
  return body;
}
function spawnWorkers(room, context, state) {
  const spawns = context.structures.filter(s => s.my && s.structureType === STRUCTURE_SPAWN && !s.spawning);
  const counts = { harvester: 0, upgrader: 0, builder: 0 };
  for (const creep of context.creeps) {
    const replacementTime = creep.body.length * CREEP_SPAWN_TIME + 30;
    if (creep.spawning || creep.ticksToLive > replacementTime) {
      if (counts[creep.memory.role] !== undefined) counts[creep.memory.role]++;
    }
  }
  const targets = { harvester: Math.min(4, context.sources.length * 2), upgrader: 2,
    builder: context.sites.length ? 1 : 0 };
  let role;
  if (counts.harvester < Math.min(2, targets.harvester)) role = 'harvester';
  else if (counts.upgrader < 1) role = 'upgrader';
  else if (counts.harvester < targets.harvester) role = 'harvester';
  else if (counts.builder < targets.builder) role = 'builder';
  else if (counts.upgrader < targets.upgrader) role = 'upgrader';
  state.population = counts;
  state.targets = targets;
  if (!role || !spawns.length) return;
  const bootstrap = counts.harvester < 2;
  const desired = bootstrap ? 200 : Math.min(room.energyCapacityAvailable, 800);
  // Existing workers keep gathering while we save for an affordable larger worker.
  if (room.energyAvailable < desired) {
    state.spawn = { role, result: 'saving', energy: room.energyAvailable, required: desired };
    return;
  }
  const body = bodyFor(desired);
  if (!body) return;
  const name = `${role}-${room.name}-${Game.time}`;
  const result = spawns[0].spawnCreep(body, name,
    { memory: { role, home: room.name, working: false } });
  state.spawn = { role, name, result, tick: Game.time };
}
function planExtensions(room, context, state) {
  if (Game.time % 25 !== 0 || !room.controller || room.controller.level < 2 || context.sites.length >= 3) return;
  const allowed = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level];
  const built = context.structures.filter(s => s.my && s.structureType === STRUCTURE_EXTENSION).length;
  const pending = context.sites.filter(s => s.structureType === STRUCTURE_EXTENSION).length;
  if (built + pending >= allowed) return;
  const spawn = context.structures.find(s => s.my && s.structureType === STRUCTURE_SPAWN);
  if (!spawn) return;
  const terrain = room.getTerrain();
  const important = context.sources.concat([room.controller], room.find(FIND_MINERALS));
  let remaining = Math.min(3 - context.sites.length, allowed - built - pending);
  for (let radius = 2; radius <= 6 && remaining > 0; radius++) {
    for (let dx = -radius; dx <= radius && remaining > 0; dx++) {
      for (let dy = -radius; dy <= radius && remaining > 0; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = spawn.pos.x + dx, y = spawn.pos.y + dy;
        // Checkerboard leaves connected lanes around structures and the spawn.
        if (x < 3 || y < 3 || x > 46 || y > 46 || (x + y) % 2 !== 0) continue;
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
        if (important.some(p => Math.max(Math.abs(p.pos.x - x), Math.abs(p.pos.y - y)) <= 2)) continue;
        if (room.lookForAt(LOOK_STRUCTURES, x, y).length || room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length) continue;
        const path = spawn.pos.findPathTo(x, y, { range: 1, ignoreCreeps: true, maxRooms: 1 });
        const last = path[path.length - 1];
        if (!last || Math.max(Math.abs(last.x - x), Math.abs(last.y - y)) > 1) continue;
        const result = room.createConstructionSite(x, y, STRUCTURE_EXTENSION);
        state.construction = { tick: Game.time, x, y, result };
        if (result === OK) remaining--;
        else if (result === ERR_FULL || result === ERR_RCL_NOT_ENOUGH) return;
      }
    }
  }
}
function towers(context) {
  const hostiles = context.room.find(FIND_HOSTILE_CREEPS);
  for (const tower of context.structures.filter(s => s.my && s.structureType === STRUCTURE_TOWER)) {
    const injured = context.creeps.filter(c => c.hits < c.hitsMax);
    if (hostiles.length) tower.attack(tower.pos.findClosestByRange(hostiles));
    else if (injured.length) tower.heal(tower.pos.findClosestByRange(injured));
  }
}
function reportError(scope, error) {
  const text = String(error.stack || error);
  Memory.colony.errors = (Memory.colony.errors || 0) + 1;
  Memory.colony.lastError = { tick: Game.time, scope, message: text.slice(0, 1500) };
  if (!Memory.colony.lastLog || Game.time - Memory.colony.lastLog >= 50) {
    console.log(`[colony ${VERSION}] ${scope}: ${text}`);
    Memory.colony.lastLog = Game.time;
  }
}
function loop() {
  Memory.colony = Memory.colony || {};
  Memory.colony.errors = Memory.colony.errors || 0;
  Memory.colony.rooms = Memory.colony.rooms || {};
  Memory.creeps = Memory.creeps || {};
  for (const name of Object.keys(Memory.creeps)) if (!Game.creeps[name]) delete Memory.creeps[name];
  // Adopt creeps created by earlier versions, keeping their source assignments.
  for (const creep of Object.values(Game.creeps)) {
    if (!creep.memory.home) creep.memory.home = creep.room.name;
  }
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller || !room.controller.my) continue;
    try {
      const structures = room.find(FIND_STRUCTURES);
      const creeps = roomCreeps(room);
      const context = { room, structures, creeps, sources: room.find(FIND_SOURCES),
        sites: room.find(FIND_MY_CONSTRUCTION_SITES),
        drops: room.find(FIND_DROPPED_RESOURCES).filter(d => d.resourceType === RESOURCE_ENERGY),
        stores: structures.filter(s => s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE)
          .concat(room.find(FIND_TOMBSTONES), room.find(FIND_RUINS)),
        harvesters: creeps.filter(c => c.memory.role === 'harvester' && !c.spawning).length };
      const state = Memory.colony.rooms[room.name] = Memory.colony.rooms[room.name] || {};
      spawnWorkers(room, context, state);
      planExtensions(room, context, state);
      towers(context);
      for (const creep of creeps) {
        if (Game.cpu.getUsed() > Game.cpu.tickLimit * 0.8) break;
        try { work(creep, context); } catch (error) { reportError(creep.name, error); }
      }
      if (Game.time % 20 === 0) {
        state.tick = Game.time;
        state.rcl = room.controller.level;
        state.progress = room.controller.progress;
        state.progressTotal = room.controller.progressTotal;
        state.ticksToDowngrade = room.controller.ticksToDowngrade;
        state.energy = room.energyAvailable;
        state.capacity = room.energyCapacityAvailable;
        state.creeps = creeps.length;
        state.roles = creeps.reduce((roles, c) => {
          roles[c.memory.role] = (roles[c.memory.role] || 0) + 1;
          return roles;
        }, {});
        state.sites = context.sites.length;
      }
    } catch (error) { reportError(room.name, error); }
  }
  Memory.colony.version = VERSION;
  Memory.colony.lastTick = Game.time;
  Memory.colony.cpu = { used: Math.round(Game.cpu.getUsed() * 100) / 100,
    bucket: Game.cpu.bucket, limit: Game.cpu.limit };
}
module.exports.loop = loop;
// Pure helpers also support local scenario tests; the game calls only loop.
module.exports.bodyFor = bodyFor;
