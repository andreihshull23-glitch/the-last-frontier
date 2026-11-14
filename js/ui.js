// Everything that is not the 3D view: the title, hiring, the panels that open
// at shop counters and people in Mercy, briefings, results, pause and settings.
// Full screens render into #ui; panels render into #panel above the town.

import * as R from './rules.js';
import { PAD_ACTIONS } from './gamepad.js';
import { GEAR, SUPPLIES, INVESTMENTS, TRAITS, FACTIONS, GUNS, GUN_ORDER, UPGRADES, gunStats, SHOPS, TALK, CHAPTERS, AMMO, PROLOGUE, HERO } from './content.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const signed = (n) => (n > 0 ? `+${n}` : String(n));

export function createUI(root, panelEl, api) {
  let screen = null;
  let panel = null;
  let data = {};
  let pdata = {};
  let notice = '';
  let confirmNew = false;

  const c = () => api.campaign();

  // ---------------------------------------------------------------- full screens
  function show(name, d = {}) {
    screen = name;
    data = d;
    notice = '';
    confirmNew = false;
    root.hidden = false;
    root.className = name === 'title' || name === 'loading' ? 'over-town' : '';
    render();
    root.scrollTop = 0;
  }
  function hide() { screen = null; root.hidden = true; root.innerHTML = ''; }
  function flash(msg) { notice = msg; if (panel) renderPanel(); else render(); }

  function render() {
    if (!screen) return;
    const fn = SCREENS[screen];
    root.innerHTML = `<div class="screen ${screen}-screen">${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ''}${fn ? fn() : ''}</div>`;
  }

  const saveLine = () => {
    const st = api.saveStatus();
    if (st.cloud) return 'Saved to your account. Play on any device.';
    if (st.local) return 'Saved in this browser only.';
    return 'Saving is unavailable here. Progress lasts until you close the page.';
  };

  const SCREENS = {
    loading() {
      const pct = Math.round((data.progress ?? 0) * 100);
      return `<section class="title-copy">
        <p class="eyebrow">A cyberpunk roguelike</p>
        <h1 class="title">The Last<br>Frontier</h1>
        <p class="lede">${data.error ? esc(data.error) : 'Booting Mercy Deck…'}</p>
        <div class="loadbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
      </section>`;
    },
    title() {
      const camp = c();
      const ch = camp?.character;
      let cont = '';
      if (camp) {
        const sub = data.resume ? 'Back to the run in progress'
          : R.needsSuccessor(camp) ? 'Back on the deck'
            : `${esc(ch.name)} · ${R.storyDone(camp) ? 'story finished' : `chapter ${camp.chapter + 1} of ${CHAPTERS.length}`} · ¢${camp.cash}`;
        cont = `<button class="btn" data-act="continue">Continue<span class="btn-sub">${sub}</span></button>`;
      }
      return `<section class="title-copy">
        <p class="eyebrow">A cyberpunk roguelike</p>
        <h1 class="title">The Last<br>Frontier</h1>
        <p class="lede">A sealed tower. A corporation that lost control of its own machines. Something older waking under the foundations. Take the job, get out before lockdown, and spend what you earn on the deck.</p>
        <div class="actions">
          ${cont}
          <button class="btn ${camp ? 'ghost' : ''}" data-act="new">${camp ? 'New campaign' : 'Jack in'}${camp ? '' : '<span class="btn-sub">Start a new campaign</span>'}</button>
          <button class="btn ghost" data-act="howto">How to play</button>
          <button class="btn ghost" data-act="settings">Settings</button>
        </div>
        ${confirmNew ? `<div class="confirm"><p><strong>Start over?</strong> This erases the campaign: creds, plug-ins, unlocked guns, the deck and the story.</p>
          <div class="row"><button class="btn danger" data-act="new-yes">Erase and start over</button><button class="btn ghost" data-act="new-no">Keep playing</button></div></div>` : ''}
        <p class="save-note"><span>${esc(saveLine())}</span>${data.migrated ? '<span>Your earlier campaign was carried over: creds, deck and story progress.</span>' : ''}</p>
      </section>`;
    },
    howto() {
      return `<section class="result">
        <p class="eyebrow">How to play</p>
        <h1 class="h-screen">Go out. Come back.</h1>
        <div class="rules">
          <div><h3>The loop</h3><p>Walk Mercy Deck. Buy supplies and kit, fit a plug-in, unlock guns. Take a job at the board or from the marshal, then take the freight lift at the west end of the concourse.</p></div>
          <div><h3>The run</h3><p>Reach the objective, then reach an exit: the lift you came in by, or the tram stop. Hold still in the circle for six seconds. Everything you picked up is unsecured until you do.</p></div>
          <div><h3>Lockdown</h3><p>The clock at the top counts down to lockdown. After it you see less, and Hollow walkers hunt in growing packs.</p></div>
          <div><h3>Going down</h3><p>The clinic drags you back to the deck. You lose what the run turned up and the kit you wore. Banked creds, plug-ins, unlocked guns, the deck and the story are kept. If a person put you down, they take your kit and become a bounty you can hunt.</p></div>
          <div><h3>Fighting</h3><p>Every enemy shows where its attack will land before it lands: a cone, a line or a circle on the ground. Step out, or roll through with Space. An aimed shot staggers most enemies out of a wind-up.</p></div>
          <div><h3>Machines</h3><p>Meridian's robots take more punishment than people. Energy weapons hit them much harder, and the arc caster locks them up for a moment.</p></div>
          <div><h3>Quiet</h3><p>Enemies see in a cone and hear gunfire, sprinting and explosions. A ring over a head is suspicion filling. Scouts fire flares: kill them first.</p></div>
        </div>
        <table class="keys"><caption class="muted">Keyboard and mouse. On a phone the buttons are on screen.</caption>
          <tr><th>Move</th><td>W A S D</td><th>Look</th><td>Mouse (click once to take the mouse, Esc lets go)</td></tr>
          <tr><th>Sprint</th><td>Shift</td><th>Dodge roll</th><td>Space</td></tr>
          <tr><th>Fire</th><td>Left click (hold to keep firing)</td><th>Alt fire</th><td>Right click or F: fan the sidearm, both barrels, or an overcharged bolt</td></tr>
          <tr><th>Guns</th><td>1 to 7, mouse wheel or X</td><th>Reload</th><td>R</td></tr>
          <tr><th>Journal</th><td>J: the story so far and what to do next</td><th></th><td></td></tr>
          <tr><th>Charge</th><td>G (lands where you aim)</td><th>Dressing</th><td>Q</td></tr>
          <tr><th>Use / talk</th><td>E (hold for caches)</td><th>Map</th><td>M or Tab</td></tr>
          <tr><th>Menu</th><td>Esc or P</td><th></th><td></td></tr>
        </table>
        <button class="btn" data-act="back">Back</button>
      </section>`;
    },
    hire() {
      const camp = c();
      const last = camp.fallen[camp.fallen.length - 1];
      const first = camp.fallen.length === 0;
      return `<section class="result hire">
        <p class="eyebrow">Mercy Deck, level 12</p>
        <h1 class="h-screen">Choose your first plug-in</h1>
        ${first
    ? `<p class="lede">You are ${esc(HERO.name)}. ${esc(HERO.bio)} The rig shop fits every new runner with one plug-in on the house. You can buy the others later and swap between runs.</p>`
    : `<div class="memory"><p><strong>${esc(last.name)}</strong> was killed by ${esc(last.killedBy)}.</p>
       <p class="muted">Kept: ¢${camp.cash} in the bank, ${camp.armory.guns.length ? camp.armory.guns.map((g) => GUNS[g].name.toLowerCase()).join(' and ') + ', ' : ''}the deck and the story so far. Lost: their kit and everything they carried.${camp.bounty ? ` ${esc(camp.bounty.name)} is wearing that kit now. There is a bounty on the board.` : ''}</p></div>`}
        <div class="candidates">${(camp.candidates ?? []).map((k, i) => `<article class="candidate">
          <p class="eyebrow">Plug-in</p>
          <h3>${esc(TRAITS[k.trait].name)}</h3>
          <p class="trait-desc">${esc(TRAITS[k.trait].desc)}</p>
          <button class="btn" data-act="hire" data-i="${i}">Fit this one</button>
        </article>`).join('')}</div>
        ${first ? `<div class="prologue"><p class="eyebrow">The story so far</p>${PROLOGUE.map((p) => `<p><strong>${esc(p.title)}.</strong> ${esc(p.text)}</p>`).join('')}</div>` : ''}
      </section>`;
    },
    results() {
      const s = data.summary;
      const camp = c();
      const died = s.outcome === 'died';
      const head = died ? 'Flatlined. Briefly.' : s.outcome === 'missing' ? 'Stumbled home' : s.outcome === 'fled' ? 'Turned back' : s.done ? 'Job done' : 'Home alive';
      const d = s.delta || { cash: 0, prosperity: 0, rep: { meridian: 0, riders: 0 } };
      const deltas = [];
      if (d.cash) deltas.push(`<span class="${d.cash > 0 ? 'good' : 'bad'}">Cash ${signed(d.cash)}</span>`);
      if (d.prosperity) deltas.push(`<span class="good">Deck ${signed(d.prosperity)}</span>`);
      for (const f of ['meridian', 'riders']) if (d.rep?.[f]) deltas.push(`<span class="${d.rep[f] > 0 ? 'good' : 'bad'}">${FACTIONS[f].short} ${signed(d.rep[f])}</span>`);
      return `<section class="result ${died ? 'died' : 'extracted'}">
        <p class="eyebrow">${esc(s.title)}</p>
        <h1 class="result-head">${head}</h1>
        ${s.lines.length ? `<table class="ledger">${s.lines.map((l) => `<tr class="${l.tone || ''}"><th>${esc(l.label)}</th><td>${esc(l.value)}</td></tr>`).join('')}</table>` : ''}
        ${deltas.length ? `<div class="deltas">${deltas.join('')}</div>` : ''}
        ${s.lost?.length ? `<p class="lost">Lost: ${esc(s.lost.join(', '))}.</p>` : ''}
        ${s.down ? `<div class="memory"><p><strong>You went down.</strong> Killed by ${esc(s.down.killedBy)}. The clinic's recovery team dragged you back to the deck${s.down.times > 1 ? `, for the ${s.down.times}${['th','st','nd','rd'][s.down.times % 10 > 3 || (s.down.times % 100 > 10 && s.down.times % 100 < 14) ? 0 : s.down.times % 10]} time` : ''}.</p><p class="muted">Gone: everything the run turned up${s.down.lostKit.length ? `, and the kit you wore (${esc(s.down.lostKit.join(', '))})` : ''}. Kept: banked creds, plug-ins, unlocked guns, the deck and the story.</p></div>` : ''}
        ${s.obituary ? `<div class="memory"><p><strong>${esc(s.obituary.name)}</strong>, ${esc(TRAITS[s.obituary.trait]?.name.toLowerCase() ?? '')}. ${plural(s.obituary.expeditions, 'run')}, ${plural(s.obituary.kills, 'kill')}. Killed by ${esc(s.obituary.killedBy)}.</p>
          ${s.bounty ? `<p class="wanted"><strong>Wanted: ${esc(s.bounty.name)}.</strong> They took ${s.bounty.gear.length ? esc(s.bounty.gear.map((g) => GEAR[g]?.name.toLowerCase()).join(', ')) : 'what was carried'}. Kill them and bring the effects home.</p>` : ''}
          <p class="muted">Your creds and the deck are still here.</p></div>` : ''}
        ${s.outro ? `<div class="finale"><p class="eyebrow">${s.ending ? 'The end of the story' : 'What happens next'}</p><p class="lede">${esc(s.outro)}</p>
          ${s.ending ? `<p class="lede">${s.ending === 'exposed' ? 'The ledger you leaked did the rest. Meridian is finished below level 40, and Mercy Deck is on a floor plan again, by choice.' : 'The company you sold the ledger to will send another foreman by spring. But tonight the lamps are lit on Main Street.'}</p><p class="muted">The frontier stays open. There is always more work on the board.</p>` : ''}</div>` : ''}
        ${s.choice ? '<p class="warn">The ledger is in your saddlebag. Talk to the marshal to decide who reads it.</p>' : ''}
        <button class="btn" data-act="results-done">${'Back to the deck'}</button>
      </section>`;
    },
  };

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    api.audio.unlock();
    api.audio.play('ui');
    const act = btn.dataset.act;
    if (act === 'continue') api.continueGame();
    else if (act === 'new') { if (c()) { confirmNew = true; render(); } else api.newCampaign(); }
    else if (act === 'new-yes') api.newCampaign();
    else if (act === 'new-no') { confirmNew = false; render(); }
    else if (act === 'howto') show('howto', { back: screen, backData: data });
    else if (act === 'settings') openPanel('settings', { fromTitle: true });
    else if (act === 'back') show(data.back || 'title', data.backData || {});
    else if (act === 'hire') { const r = R.hireDrifter(c(), Number(btn.dataset.i)); if (r.ok) { api.persist(); api.enterTown('saloon'); } else flash(r.reason); }
    else if (act === 'results-done') { if (R.needsSuccessor(c())) show('hire'); else api.enterTown('trail'); }
  });

  // ---------------------------------------------------------------- panels
  function openPanel(name, d = {}) {
    panel = name;
    pdata = d;
    notice = '';
    panelEl.hidden = false;
    renderPanel();
    panelEl.querySelector('.sheet')?.focus();
  }
  function closePanel() {
    if (!panel) return;
    const was = panel;
    panel = null;
    panelEl.hidden = true;
    panelEl.innerHTML = '';
    api.onPanelClose(was);
  }

  const head = (eyebrow, title) => `<div class="bar"><div><p class="eyebrow">${esc(eyebrow)}</p><h2 id="panel-title">${esc(title)}</h2></div><div class="purse num">¢${c()?.cash ?? 0}</div></div>`;
  const foot = (label = 'Step away') => `<div class="row sheet-foot"><button class="btn ghost" data-p="close">${label}</button></div>`;
  const line = (role) => { const t = TALK[role] || TALK.townsfolk; return t[Math.min(c().chapter, t.length - 1)]; };

  function buyRow(title, desc, have, check, label, attrs) {
    return `<div class="item"><div><h3>${esc(title)}</h3><p>${esc(desc)}</p>${have ? `<p class="have">${esc(have)}</p>` : ''}</div>
      <button class="btn ${check.ok ? '' : 'ghost'}" ${attrs} ${check.ok ? '' : 'disabled'}>${esc(label)}<span class="btn-sub">${check.ok ? `¢${check.price}` : check.price !== undefined ? `¢${check.price} · ${esc(check.reason)}` : esc(check.reason)}</span></button></div>`;
  }

  function missionCard(m, compact = false) {
    const tags = [];
    if (m.kind === 'story') tags.push(`Chapter ${m.chapter}`);
    if (m.faction) tags.push(FACTIONS[m.faction].short);
    if (m.kind === 'descent') tags.push('Roguelike run', `${m.floors} floors`, m.best ? `Best: floor ${m.best}` : 'Never finished');
    else tags.push(m.gen === 'mine' ? 'Underground' : m.night ? 'After dark' : 'Canyon');
    if (m.kind === 'job' && m.tier) tags.push(`Danger ${m.tier}`);
    const rep = Object.entries(m.rep).map(([f, d]) => `${FACTIONS[f].short} ${signed(d)}`);
    return `<article class="bill ${m.faction || 'none'} ${m.kind === 'story' ? 'is-selected' : ''}">
      <div class="tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
      <h3>${esc(m.title)}</h3>
      <p class="brief">${esc(m.brief)}</p>
      <p class="reward num">${m.kind === 'descent' ? 'Paid by the floor, even if you do not come back' : m.cash ? `¢${m.cash}` : 'Paid on proof'}${rep.length ? ' · ' + esc(rep.join(' · ')) : ''}${m.prosperity ? ` · Mercy ${signed(m.prosperity)}` : ''}</p>
      ${compact ? '' : `<button class="btn" data-p="pick" data-id="${esc(m.id)}">Take this job</button>`}
    </article>`;
  }

  function loadout() {
    const camp = c(), ch = camp.character;
    const guns = ['revolver', ...camp.armory.guns].map((g) => GUNS[g].name);
    const warn = [];
    if (ch.hp < R.maxHp(ch) * 0.6) warn.push('You are hurt. The doctor is across the street.');
    if (ch.cartridges < 30) warn.push('You are low on cartridges. The general store sells them.');
    if (ch.bandages === 0) warn.push('You carry no dressings.');
    return `<dl class="kit">
      <div><dt>Health</dt><dd><span class="hp"><span style="width:${(ch.hp / R.maxHp(ch)) * 100}%"></span></span><span class="num">${ch.hp}/${R.maxHp(ch)}</span></dd></div>
      <div><dt>Guns</dt><dd>${esc(guns.join(', '))}</dd></div>
      <div><dt>Carried</dt><dd class="num">${ch.cartridges} slugs${camp.armory.guns.includes('shotgun') ? `, ${ch.shells} shells` : ''}, ${plural(ch.bandages, 'dressing')}, ${ch.dynamite} dynamite</dd></div>
      <div><dt>Kit</dt><dd>${ch.gear.length ? esc(ch.gear.map((g) => GEAR[g].name).join(', ')) : 'None'}</dd></div>
    </dl>${warn.map((w) => `<p class="warn">${esc(w)}</p>`).join('')}`;
  }

  const PANELS = {
    store() {
      const camp = c(), ch = camp.character;
      return `${head(SHOPS.store.keeper, 'General Store')}
        <p class="muted">“${esc(line('townsfolk'))}”</p>
        <div class="items">${Object.entries(SUPPLIES).map(([id, s]) => buyRow(s.name, s.desc, `Carrying ${ch[s.field]} of ${R.ammoCap(camp, s.field)}`, R.canBuy(camp, id), 'Buy', `data-p="buy" data-id="${id}"`)).join('')}</div>${foot()}`;
    },
    gunsmith() {
      const camp = c();
      const ups = camp.armory.upgrades;
      const stat = (g) => {
        const s = gunStats(g, ups);
        const bits = [`${s.pellets ? `${s.pellets} × ${s.damage}` : s.damage} damage`, `${(1 / s.cooldown).toFixed(1)} shots a second`, `${s.mag} ${s.ammo ? 'rounds' : 'charges'}`, `${Math.round(s.range / 32)} m`];
        bits.push(s.recharge ? 'recharges, no ammunition' : s.magReload ? `swaps the magazine in ${s.magReload} s` : `loads one round every ${s.reloadRound} s`);
        if (s.ammo) bits.push(`uses ${s.ammo}`);
        if (s.pierce) bits.push(`pierces ${s.pierce + 1} targets`);
        if (s.chain) bits.push(`jumps to ${s.chain} more`);
        if (s.robotMul > 1) bits.push(`+${Math.round((s.robotMul - 1) * 100)}% to machines`);
        return bits.join(' · ');
      };
      const guns = GUN_ORDER.map((g) => {
        const owned = g === 'revolver' || camp.armory.guns.includes(g);
        const def = GUNS[g];
        return owned
          ? `<div class="item built"><div><h3>${esc(def.name)} <span class="muted">· ${esc(def.role)}</span></h3><p>${esc(def.desc)}</p><p class="have">${esc(stat(g))}</p></div><span class="have">${g === 'revolver' ? 'You always carry it' : 'Unlocked: can be found'}</span></div>`
          : def.base
            ? `<div class="item built"><div><h3>${esc(def.name)} <span class="muted">· ${esc(def.role)}</span></h3><p>${esc(def.desc)}</p><p class="have">${esc(stat(g))}</p></div><span class="have">Found on every ride</span></div>`
            : buyRow(`${def.name} · ${def.role}`, def.desc, stat(g), R.canBuyGun(camp, g), 'Unlock', `data-p="gun" data-id="${g}"`);
      }).join('');
      const work = Object.entries(UPGRADES).map(([id, u]) => (ups.includes(id)
        ? `<div class="item built"><div><h3>${esc(u.name)}</h3><p>${esc(u.desc)}</p></div><span class="have">Fitted</span></div>`
        : buyRow(u.name, u.desc, GUNS[u.gun].name, R.canBuyUpgrade(camp, id), 'Fit', `data-p="upgrade" data-id="${id}"`))).join('');
      return `${head(SHOPS.gunsmith.keeper, 'Gun counter')}
        <p class="muted">You go out with the sidearm and find everything else on the way: in caches, at fences down the shaft, and on whatever you kill. Paying Tess to build a gun means it can turn up from then on. Try any of them at the range behind the counter.</p>
        <h3 class="section">Guns</h3><div class="items">${guns}</div>
        <h3 class="section">Workshop</h3><div class="items">${work}</div>${foot()}`;
    },
    outfitter() {
      const camp = c(), ch = camp.character;
      const owned = R.ownedPlugins(camp);
      const plugs = Object.entries(TRAITS).map(([id, t]) => (owned.includes(id)
        ? `<div class="item built"><div><h3>${esc(t.name)}</h3><p>${esc(t.desc)}</p></div>${ch.trait === id ? '<span class="have">Fitted</span>' : `<button class="btn" data-p="plugfit" data-id="${id}">Fit<span class="btn-sub">owned</span></button>`}</div>`
        : buyRow(t.name, t.desc, '', R.canBuyPlugin(camp, id), 'Buy', `data-p="plugbuy" data-id="${id}"`))).join('');
      return `${head(SHOPS.outfitter.keeper, 'Rig shop')}
        <h3 class="section">Plug-ins</h3>
        <p class="muted">One plug-in is fitted at a time. Swap whenever you are on the deck. They stay with you when a run goes wrong.</p>
        <div class="items">${plugs}</div>
        <h3 class="section">Kit</h3>
        <p class="muted">Kit is worn. If you go down, whoever put you there wears it next.</p>
        <div class="items">${Object.entries(GEAR).map(([id, g]) => (ch.gear.includes(id)
    ? `<div class="item built"><div><h3>${esc(g.name)}</h3><p>${esc(g.desc)}</p></div><span class="have">Worn</span></div>`
    : buyRow(g.name, g.desc, '', R.canBuy(camp, id), 'Buy', `data-p="buy" data-id="${id}"`))).join('')}</div>${foot()}`;
    },
    clinic() {
      const camp = c(), ch = camp.character;
      const max = R.maxHp(ch), price = R.clinicPrice(camp);
      const hurt = ch.hp < max;
      return `${head(SHOPS.clinic.keeper, 'Clinic')}
        <p class="muted">${hurt ? '“Sit. Hold still. This is going to sting.”' : '“Nothing wrong with you that a week of sleep would not fix.”'}</p>
        <dl class="kit"><div><dt>Health</dt><dd><span class="hp"><span style="width:${(ch.hp / max) * 100}%"></span></span><span class="num">${ch.hp}/${max}</span></dd></div></dl>
        <div class="row"><button class="btn" data-p="treat" ${hurt && camp.cash >= price ? '' : 'disabled'}>Get patched up<span class="btn-sub">${!hurt ? 'In good health' : price ? `¢${price}` : 'Free: the clinic is stocked'}</span></button></div>
        ${foot()}`;
    },
    hall() {
      const camp = c();
      const meter = (f) => `<div class="stat"><span class="k">${esc(FACTIONS[f].name)}</span><span class="v num ${camp.rep[f] > 0 ? 'good' : camp.rep[f] < 0 ? 'bad' : ''}">${signed(camp.rep[f])}</span>
        <div class="meter"><span class="mid"></span><span class="pin" style="left:${((camp.rep[f] + 5) / 10) * 100}%"></span></div></div>`;
      const perks = R.perkDetails(camp);
      return `${head('The Unlisted', 'Customs Hall')}
        <div class="status three"><div class="stat"><span class="k">The deck</span><span class="v">${esc(R.prosperityLabel(camp.prosperity))}</span><span class="have">Standing ${camp.prosperity}</span></div>${meter('meridian')}${meter('riders')}</div>
        ${perks.length ? `<div class="perks">${perks.map((p) => `<p class="${p.bad ? 'bad' : 'good'}"><strong>${esc(p.name)}.</strong> ${esc(p.desc)}</p>`).join('')}</div>` : ''}
        <h3 class="section">Put creds into the deck</h3>
        <div class="items">${Object.entries(INVESTMENTS).map(([id, inv]) => (camp.investments.includes(id)
    ? `<div class="item built"><div><h3>${esc(inv.name)}</h3><p>${esc(inv.effect)}</p></div><span class="have">Done</span></div>`
    : buyRow(inv.name, inv.effect, '', R.canInvest(camp, id), 'Fund', `data-p="invest" data-id="${id}"`))).join('')}</div>${foot()}`;
    },
    telegraph() {
      const wires = R.telegrams(c(), 24);
      return `${head(SHOPS.telegraph.keeper, 'Feed terminal')}
        <div class="tape-feed">${wires.map((t) => `<p class="tape"><span class="stamp">Deck 12 · run ${t.at}</span>${esc(t.text)}</p>`).join('') || '<p class="muted">The feed is quiet.</p>'}</div>${foot()}`;
    },
    saloon() {
      return `${head(SHOPS.saloon.keeper, 'The Low Tide')}
        <p class="lede">“${esc(line('barkeep'))}”</p>
        <div class="row"><button class="btn" data-p="jobs">See the job board</button></div>${foot()}`;
    },
    stable() { return PANELS.jobs(); },
    jobs() {
      const camp = c();
      const list = R.availableMissions(camp);
      if (pdata.pick) {
        const m = list.find((x) => x.id === pdata.pick);
        if (m) {
          return `${head('Before you go', m.title)}
            ${missionCard(m, true)}
            ${m.hint ? `<p class="muted">${esc(m.hint)}</p>` : ''}
            ${loadout()}
            <div class="row"><button class="btn" data-p="ride" data-id="${esc(m.id)}">Go<span class="btn-sub">Take the lift now</span></button><button class="btn ghost" data-p="unpick">Not yet</button></div>`;
        }
      }
      return `${head('Mercy Deck', 'Work')}
        ${camp.pendingChoice ? '<p class="warn">The marshal is waiting on your decision about the ledger. The story does not move until you make it.</p>' : ''}
        ${R.storyDone(camp) ? '<p class="muted">The story is finished. These jobs get harder, and pay better, the longer you keep riding.</p>' : ''}
        <div class="bills">${list.map((m) => missionCard(m)).join('') || '<p class="muted">Nothing on the board today.</p>'}</div>${foot()}`;
    },
    talk() {
      const camp = c();
      const role = pdata.role;
      const chapter = R.currentChapter(camp);
      const giver = chapter && !camp.pendingChoice && chapter.giver === role;
      let body = `<p class="lede">“${esc(line(role))}”</p>`;
      if (role === 'marshal' && camp.pendingChoice === 'ledger') {
        body = `<div class="decision"><h3>Who reads the Site 9 ledger?</h3>
          <p>Unit numbers, dates, the intake list, and what is under the foundations. It is the only copy.</p>
          <div class="choices">
            <div class="choice"><h4>Give it to the Unlisted</h4><p>They will put it on every screen they can reach. Unlisted +3, Meridian −3, Deck +1. The machines will be sent after you.</p><button class="btn" data-p="ledger" data-id="expose">Expose Meridian</button></div>
            <div class="choice"><h4>Sell it back</h4><p>300 creds and the corporation's gratitude. Meridian +2, Unlisted −2. Nobody ever reads it.</p><button class="btn ghost" data-p="ledger" data-id="sell">Take the money</button></div>
          </div></div>`;
      } else if (giver) {
        const m = R.availableMissions(camp).find((x) => x.kind === 'story');
        body += m ? `${missionCard(m, true)}<div class="row"><button class="btn" data-p="pick" data-id="${esc(m.id)}">Take the job</button></div>` : '';
      } else if (role === 'undertaker') {
        body += camp.fallen.length
          ? `<div class="graves">${camp.fallen.slice(-6).reverse().map((f) => `<div class="grave"><h3>${esc(f.name)}</h3><p class="epitaph">Killed by ${esc(f.killedBy)}.</p><p class="have">${plural(f.expeditions, 'run')} · ${plural(f.kills ?? 0, 'kill')}</p></div>`).join('')}</div>`
          : '<p class="muted">Nobody of yours is up there yet.</p>';
      }
      return `${head('Mercy Deck', pdata.name || 'Someone on the deck')}${body}${foot('Walk on')}`;
    },
    journal() {
      const camp = c();
      const done = CHAPTERS.slice(0, camp.chapter);
      const now = R.currentChapter(camp);
      const who = (g) => (g === 'rider' ? 'Nell Dunmore, the courier outside the Low Tide' : 'Marshal Ada Quill, outside the customs hall');
      const next = camp.pendingChoice
        ? '<div class="decision"><h3>Now: decide who reads the ledger</h3><p>Talk to the marshal outside the customs hall.</p></div>'
        : now
          ? `<div class="decision"><h3>Now: chapter ${camp.chapter + 1} of ${CHAPTERS.length}, ${esc(now.title)}</h3><p><strong>${esc(now.goal)}</strong></p><p>${esc(now.brief)}</p><p class="muted">To start it, talk to ${esc(who(now.giver))} (the gold marker in town), or take the freight lift at the west end of the concourse.</p></div>`
          : '<div class="decision"><h3>The story is finished</h3><p>Mercy Deck stands. There is always more work on the board at the Low Tide.</p></div>';
      const past = done.length
        ? `<h3 class="section">The story so far</h3><ol class="journal">${done.map((ch) => `<li><strong>${esc(ch.title)}.</strong> ${esc(ch.recap)}</li>`).join('')}</ol>`
        : `<h3 class="section">How it began</h3><ol class="journal">${PROLOGUE.map((p) => `<li><strong>${esc(p.title)}.</strong> ${esc(p.text)}</li>`).join('')}</ol>`;
      const ahead = now ? `<p class="muted">Still ahead: ${CHAPTERS.slice(camp.chapter + 1).map((ch) => esc(ch.title)).join(' · ') || 'nothing after this one'}.</p>` : '';
      return `<div class="bar"><div><p class="eyebrow">Journal</p><h2 id="panel-title">What is going on</h2></div></div>${next}${past}${ahead}${foot('Close')}`;
    },
    pause() {
      const ride = api.inRide();
      const s = api.settings();
      return `<div class="bar"><div><p class="eyebrow">Paused${c()?.character ? ' · ' + esc(c().character.name) : ''}</p><h2 id="panel-title">${ride ? esc(api.rideTitle()) : 'Mercy Deck'}</h2></div></div>
        ${ride ? `<ul class="objectives">${api.objectives().map((o) => `<li class="${o.done ? 'done' : ''}">${esc(o.text)}</li>`).join('')}</ul>` : ''}
        <div class="row">
          <button class="btn" data-p="close">Resume</button>
          <button class="btn ghost" data-p="open" data-id="journal">Journal</button>
          <button class="btn ghost" data-p="open" data-id="settings">Settings</button>
          <button class="btn ghost" data-p="open" data-id="keys">Controls</button>
          <button class="btn ghost" data-p="mute">${s.mute ? 'Sound is off' : 'Sound is on'}</button>
        </div>
        ${pdata.giveup ? `<div class="confirm"><p><strong>Give up this run?</strong> You walk home alive, with your supplies, and nothing you picked up.</p>
          <div class="row"><button class="btn danger" data-p="giveup-yes">Turn back</button><button class="btn ghost" data-p="giveup-no">Keep going</button></div></div>`
    : `<div class="row">${ride ? '<button class="link" data-p="giveup">Give up and walk home</button>' : '<button class="link" data-p="quit">Save and go to the title screen</button>'}</div>`}`;
    },
    keys() {
      return `<div class="bar"><div><p class="eyebrow">Controls</p><h2 id="panel-title">Keys</h2></div></div>
        <table class="keys">
          <tr><th>Move</th><td>W A S D</td></tr><tr><th>Look</th><td>Mouse. Click once to take the mouse; Esc lets go. Arrow keys also turn.</td></tr>
          <tr><th>Sprint</th><td>Shift</td></tr><tr><th>Dodge roll</th><td>Space</td></tr>
          <tr><th>Fire</th><td>Left click; hold to keep firing</td></tr><tr><th>Alt fire</th><td>Right click or F: fan the sidearm, both barrels, or an overcharged bolt</td></tr>
          <tr><th>Guns</th><td>1 to 7, mouse wheel, or X</td></tr><tr><th>Reload</th><td>R</td></tr>
          <tr><th>Charge</th><td>G</td></tr><tr><th>Dressing</th><td>Q</td></tr>
          <tr><th>Use / talk</th><td>E (hold for caches and objectives)</td></tr><tr><th>Map</th><td>M or Tab</td></tr>
          <tr><th>Journal</th><td>J</td></tr><tr><th>Controller</th><td>Left stick moves, right stick looks. Buttons are listed, and can be changed, in Settings.</td></tr>
        </table>
        <p class="muted keys-line">On a phone: left thumb moves (push far to sprint), right thumb looks, and the buttons do the rest.</p>
        <div class="row"><button class="btn" data-p="open" data-id="${pdata.fromTitle ? 'close' : 'pause'}">Back</button></div>`;
    },
    settings() {
      const s = api.settings();
      const pad = api.pad();
      return `<div class="bar"><div><p class="eyebrow">Settings</p><h2 id="panel-title">Make it yours</h2></div></div>
        <div class="settings">
          <label for="set-sens">Look sensitivity <span class="num" id="set-sens-v">${s.sens.toFixed(1)}×</span></label>
          <input id="set-sens" type="range" min="0.3" max="2.5" step="0.1" value="${s.sens}" data-set="sens">
          <label for="set-quality">Graphics</label>
          <select id="set-quality" data-set="quality">
            ${[['auto', 'Automatic'], ['0', 'High'], ['1', 'Medium'], ['2', 'Low (fastest)']].map(([v, n]) => `<option value="${v}" ${String(s.quality) === v ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
          <label class="check"><input id="set-invert" type="checkbox" data-set="invert" ${s.invert ? 'checked' : ''}> Invert vertical look</label>
          <label class="check"><input id="set-shake" type="checkbox" data-set="shake" ${s.shake ? 'checked' : ''}> Screen shake</label>
          <label class="check"><input id="set-mute" type="checkbox" data-set="mute" ${s.mute ? 'checked' : ''}> Mute sound</label>
          <label class="check"><input id="set-hints" type="checkbox" data-set="hints" ${s.hints ? 'checked' : ''}> Show key hints on screen</label>
        </div>
        <h3 class="section">Controller</h3>
        <p class="muted">${pad.available ? (pad.id ? `Connected: ${esc(pad.id.replace(/\s*\(.*$/, ''))}.` : 'Plug in or wake a controller and press any button on it.') : 'This page is not allowed to read controllers. Open the game in its own browser tab.'} Left stick moves and the right stick looks. In menus the left stick moves a cursor, the right stick scrolls, the D-pad steps between buttons, A or Cross presses and B or Circle goes back. Buttons are shown as Xbox / PlayStation.</p>
        <div class="padbinds">${PAD_ACTIONS.map(([id, label]) => `<div class="padrow"><span>${esc(label)}</span><button class="btn ghost small" data-p="padbind" data-id="${id}">${pad.capturing === id ? 'Press a button…' : esc(pad.label(id))}</button></div>`).join('')}</div>
        <div class="row"><button class="link" data-p="padreset">Reset controller buttons</button></div>
        <div class="row"><button class="btn" data-p="open" data-id="${pdata.fromTitle ? 'close' : 'pause'}">Done</button></div>`;
    },
  };

  let lastPanel = null;
  function renderPanel() {
    if (!panel) return;
    const keepScroll = lastPanel === panel ? panelEl.querySelector('.sheet')?.scrollTop ?? 0 : 0;
    lastPanel = panel;
    queueMicrotask(() => { const sh = panelEl.querySelector('.sheet'); if (sh && keepScroll) sh.scrollTop = keepScroll; });
    const fn = PANELS[panel];
    panelEl.innerHTML = `<div class="sheet ${panel}" role="dialog" aria-modal="true" aria-labelledby="panel-title" tabindex="-1">
      ${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ''}${fn ? fn() : ''}</div>`;
  }

  function done(result, sound = 'cash') {
    if (result.ok) { notice = ''; api.audio.play(sound); api.persist(); api.onCampaignChange(); } else notice = result.reason;
    renderPanel();
  }

  panelEl.addEventListener('click', (e) => {
    if (e.target === panelEl && panel !== 'pause') { closePanel(); return; }
    const btn = e.target.closest('[data-p]');
    if (!btn) return;
    api.audio.unlock();
    const act = btn.dataset.p, id = btn.dataset.id;
    const camp = c();
    if (act !== 'buy' && act !== 'gun' && act !== 'upgrade' && act !== 'invest' && act !== 'plugbuy') api.audio.play('ui');
    if (act === 'close') closePanel();
    else if (act === 'buy') done(R.buy(camp, id));
    else if (act === 'gun') done(R.buyGun(camp, id));
    else if (act === 'upgrade') done(R.buyUpgrade(camp, id));
    else if (act === 'plugbuy') done(R.buyPlugin(camp, id));
    else if (act === 'plugfit') done(R.fitPlugin(camp, id), 'ui');
    else if (act === 'invest') done(R.invest(camp, id));
    else if (act === 'treat') done(R.treat(camp), 'heal');
    else if (act === 'ledger') { const r = R.chooseLedger(camp, id); done(r, 'chapter'); if (r.ok) { panel = 'talk'; renderPanel(); } }
    else if (act === 'jobs') { panel = 'jobs'; pdata = {}; renderPanel(); }
    else if (act === 'pick') { panel = 'jobs'; pdata = { pick: id }; renderPanel(); }
    else if (act === 'unpick') { pdata = {}; renderPanel(); }
    else if (act === 'ride') { const was = panel; panel = null; panelEl.hidden = true; panelEl.innerHTML = ''; if (!api.startRide(id)) { panel = was; panelEl.hidden = false; renderPanel(); } }
    else if (act === 'open') { if (id === 'close') closePanel(); else { const keep = pdata.fromTitle; panel = id; pdata = { fromTitle: keep }; renderPanel(); } }
    else if (act === 'padbind') { const pad = api.pad(); if (pad.capturing === id) pad.cancelCapture(); else pad.capture(id, (binds) => { api.setSetting('pad', binds); if (panel === 'settings') renderPanel(); }); renderPanel(); }
    else if (act === 'padreset') { api.pad().cancelCapture(); api.setSetting('pad', null); renderPanel(); }
    else if (act === 'mute') { api.setSetting('mute', !api.settings().mute); renderPanel(); }
    else if (act === 'giveup') { pdata = { giveup: true }; renderPanel(); }
    else if (act === 'giveup-no') { pdata = {}; renderPanel(); }
    else if (act === 'giveup-yes') { panel = null; panelEl.hidden = true; panelEl.innerHTML = ''; api.giveUp(); }
    else if (act === 'quit') { panel = null; panelEl.hidden = true; panelEl.innerHTML = ''; api.quitToTitle(); }
  });
  panelEl.addEventListener('input', (e) => {
    const el = e.target.closest('[data-set]');
    if (!el) return;
    const key = el.dataset.set;
    const value = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value === 'auto' ? 'auto' : Number(el.value);
    api.setSetting(key, value);
    if (key === 'sens') { const v = panelEl.querySelector('#set-sens-v'); if (v) v.textContent = `${Number(value).toFixed(1)}×`; }
  });

  return {
    show, hide, flash, openPanel, closePanel, renderPanel,
    get screen() { return screen; },
    get panel() { return panel; },
    setLoading(progress, error) { if (screen === 'loading') { data = { progress, error }; render(); } },
  };
}
