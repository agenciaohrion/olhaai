/**
 * Dados de demonstração: agência + empresas clientes, pontos com coordenadas, aparelhos,
 * peças de conteúdo geradas no próprio repositório, playlists com janelas de horário,
 * vinculações e histórico de exibição para os relatórios nascerem populados.
 *
 *   npm run seed            → cria/resetar tudo
 *   npm run seed -- --keep  → só adiciona o que falta
 */
import fs from 'node:fs';
import path from 'node:path';
import { db, all, get, insert, update, run, UPLOAD_DIR, DATA_DIR } from './db.js';
import { hashPass } from './auth.js';

const KEEP = process.argv.includes('--keep');

function reset() {
  const tables = ['playlog', 'screenshots', 'device_logs', 'assignments', 'schedules', 'playlist_items', 'playlists', 'media', 'devices', 'locations', 'clients', 'audit', 'users'];
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of tables) run(`DELETE FROM ${t}`);
  for (const t of tables) run(`DELETE FROM sqlite_sequence WHERE name=?`, [t]);
  db.exec('PRAGMA foreign_keys = ON');
  for (const dir of ['thumbs', 'shots']) {
    const d = path.join(UPLOAD_DIR, dir);
    for (const f of fs.readdirSync(d)) fs.rmSync(path.join(d, f), { force: true });
  }
  for (const f of fs.readdirSync(UPLOAD_DIR)) if (f !== 'thumbs' && f !== 'shots') fs.rmSync(path.join(UPLOAD_DIR, f), { force: true });
}

/* ------------------------------- SVG das peças ------------------------------- */

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Card promocional vetorial (roda liso em qualquer resolução, pesa ~4 KB). */
function poster({ title, sub, cta, brand, tag, vertical = false, c1 = '#7c5cff', c2 = '#22d3ee', dark = false }) {
  const W = vertical ? 1080 : 1920;
  const H = vertical ? 1920 : 1080;
  const bg = dark ? '#05070f' : '#ffffff';
  const fg = dark ? '#f2f4ff' : '#0b1024';
  const muted = dark ? '#a4adcf' : '#5b6486';
  const headlineSize = vertical ? 118 : 132;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Inter','Segoe UI',Arial,sans-serif">
  <defs>
    <linearGradient id="bgg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="${dark ? '#0b1024' : '#f3f5ff'}"/>
    </linearGradient>
    <linearGradient id="blob" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bgg)"/>
  <g opacity="${dark ? 0.55 : 0.9}">
    <circle cx="${W * 0.86}" cy="${H * 0.16}" r="${W * 0.24}" fill="url(#blob)"/>
    <rect x="-140" y="${H - 220}" width="${W * 0.5}" height="180" rx="90" fill="url(#blob)" opacity=".22"/>
  </g>
  <g>
    <circle cx="120" cy="${vertical ? 150 : 132}" r="34" fill="url(#blob)"/>
    <text x="180" y="${(vertical ? 150 : 132) + 12}" font-size="40" font-weight="800" letter-spacing="6" fill="${fg}">${esc(brand)}</text>
    ${tag ? `<text x="180" y="${(vertical ? 150 : 132) + 62}" font-size="26" letter-spacing="5" fill="${muted}">${esc(tag.toUpperCase())}</text>` : ''}
  </g>
  <g>
    <text x="120" y="${H * (vertical ? 0.5 : 0.52)}" font-size="${headlineSize}" font-weight="900" fill="${fg}">${esc(title)}</text>
    ${sub ? `<text x="120" y="${H * (vertical ? 0.5 : 0.52) + (vertical ? 150 : 172)}" font-size="${vertical ? 60 : 62}" fill="${muted}">${esc(sub)}</text>` : ''}
  </g>
  ${
    cta
      ? `<g>
      <rect x="120" y="${H - (vertical ? 330 : 260)}" width="${Math.min(760, 120 + cta.length * 34)}" height="${vertical ? 130 : 120}" rx="60" fill="url(#blob)"/>
      <text x="${120 + Math.min(760, 120 + cta.length * 34) / 2}" y="${H - (vertical ? 330 : 260) + (vertical ? 84 : 76)}" text-anchor="middle" font-size="46" font-weight="800" fill="#ffffff">${esc(cta)}</text>
    </g>`
      : ''
  }
  <text x="${W - 60}" y="${H - 46}" text-anchor="end" font-size="26" letter-spacing="4" fill="${muted}">OLHA.AI · MARKETING INDOOR</text>
</svg>`;
}

function writeAsset(name, svg) {
  const file = `${name}.svg`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), svg);
  return { file, bytes: Buffer.byteLength(svg) };
}

/* ------------------------------ clientes demo ------------------------------ */

const COMPANIES = [
  {
    name: 'Piscinas Inove',
    brand: 'INOVE',
    segment: 'Varejo / piscina',
    cnpj: '12.345.678/0001-90',
    contact_name: 'Rafael Albuquerque',
    contact_email: 'rafael@inovepiscinas.com.br',
    phone: '(86) 99911-2233',
    city: 'Teresina',
    state: 'PI',
    plan: 'rede',
    monthly_value: 890,
    seats: 6,
    notes: 'Rede com 3 lojas. Quer destaque de oferta no fim de semana e aviso de manutenção em todas as TVs.',
    accent: ['#2563eb', '#22d3ee'],
    dark: false,
    locations: [
      { name: 'Loja Centro', address: 'R. Coelho de Resende, 1208 — Centro', district: 'Centro', city: 'Teresina', state: 'PI', lat: -5.0959, lng: -42.8055, kind: 'loja', footfall: 260 },
      { name: 'Loja Jóquei', address: 'Av. Miguel Frias e Vasconcelos, 1050 — Jóquei', district: 'Jóquei', city: 'Teresina', state: 'PI', lat: -5.0599, lng: -42.7713, kind: 'loja', footfall: 180 },
      { name: 'Showroom Parnaíba', address: 'Av. Pinheiro, 480 — Centro', district: 'Centro', city: 'Parnaíba', state: 'PI', lat: -2.9056, lng: -41.7794, kind: 'loja', footfall: 95 },
    ],
    media: [
      { title: 'Semana da piscina 20% off', sub: 'Cloro, bomba e filtros em até 12x', cta: 'Pergunte ao vendedor', tag: 'oferta', vertical: false },
      { title: 'Troca de água sem drama', sub: 'Agende a manutenção pelo WhatsApp', cta: 'Chamar agora', tag: 'serviço', vertical: true },
      { title: 'Deck molhado? Não aqui', sub: 'Madeira plástica com garantia de 10 anos', cta: '', tag: 'institucional', vertical: false, dark: true },
    ],
    playlist: 'Inove · Vitrine Semanal',
    extra: { kind: 'text', title: 'Aviso: atendimento no sábado até 14h', body: 'Neste sábado a loja Centro atende até 14h. Entrega de cloro grátis acima de R$ 300.' },
  },
  {
    name: 'Rede Fit Moveis',
    brand: 'MOVEIS',
    segment: 'Academia',
    cnpj: '98.765.432/0001-10',
    contact_name: 'Juliana Prado',
    contact_email: 'ju@fitmoveis.com.br',
    phone: '(86) 99922-7788',
    city: 'Teresina',
    state: 'PI',
    plan: 'essencial',
    monthly_value: 490,
    seats: 4,
    notes: 'Aulas coletivas precisam entrar na TV do mezanino na hora certa. Tablets na recepção com avaliação grátis.',
    accent: ['#f97316', '#ef4444'],
    dark: true,
    locations: [
      { name: 'Unidade Vermelha', address: 'R. Álvaro Mendes, 1400 — Centro', district: 'Centro', city: 'Teresina', state: 'PI', lat: -5.1015, lng: -42.8017, kind: 'academia', footfall: 640 },
      { name: 'Unidade South Center', address: 'Av. Raul Lopes, 1000 — Noivos', district: 'Noivos', city: 'Teresina', state: 'PI', lat: -5.0761, lng: -42.7877, kind: 'academia', footfall: 520 },
    ],
    media: [
      { title: 'Aula de spinning 19h', sub: 'Vagas limitadas · chegue 15 min antes', cta: 'Reserve na recepção', tag: 'aula', vertical: false, dark: true },
      { title: 'Musculação guiada', sub: 'Avaliação física grátis nesta semana', cta: 'Fale com o professor', tag: 'captação', vertical: true, dark: true },
      { title: 'Café funcional R$ 6', sub: 'Whey + banana + aveia', cta: '', tag: 'conveniência', vertical: false },
    ],
    playlist: 'Fit · Grade do Dia',
    extra: { kind: 'youtube', title: 'Aquecimento em vídeo', url: 'https://www.youtube.com/watch?v=3ZbydIEoQaM' },
  },
  {
    name: 'Clínica Sorriso Norte',
    brand: 'SORRISO',
    segment: 'Saúde / odontologia',
    cnpj: '45.678.123/0001-55',
    contact_name: 'Dr. Everton Lira',
    contact_email: 'contato@sorrisonorte.com.br',
    phone: '(86) 3333-1010',
    city: 'Teresina',
    state: 'PI',
    plan: 'publico',
    monthly_value: 350,
    seats: 3,
    notes: 'Sala de espera com TV e tablet no balcão. Precisa de chamada de senha e conteúdo educativo para crianças.',
    accent: ['#34d399', '#60a5fa'],
    dark: false,
    locations: [
      { name: 'Recepção Principal', address: 'Av. Frei Serafim, 2200 — Centro', district: 'Centro', city: 'Teresina', state: 'PI', lat: -5.0938, lng: -42.7931, kind: 'clinica', footfall: 310 },
      { name: 'Anexo Kid', address: 'R. Oeiras, 512 — Cabral', district: 'Cabral', city: 'Teresina', state: 'PI', lat: -5.0847, lng: -42.8029, kind: 'clinica', footfall: 140 },
      { name: 'Carro de apoio (tablet)', address: 'Em deslocamento', district: '—', city: 'Teresina', state: 'PI', kind: 'movel', footfall: 0, lat: -5.099, lng: -42.799 },
    ],
    media: [
      { title: 'Escovação em 2 minutos', sub: 'Ensine em casa o que fazemos aqui', cta: '', tag: 'educação', vertical: false },
      { title: 'Clareamento em 1 sessão', sub: 'Parcelamos em 6x sem juros', cta: 'Agende no balcão', tag: 'oferta', vertical: false },
      { title: 'Seu plano está em dia?', sub: 'Convênios atendidos: OdontoPrev, Amil, Bradesco', cta: '', tag: 'atendimento', vertical: true, dark: true },
    ],
    playlist: 'Sorriso · Sala de Espera',
    extra: { kind: 'weather', title: 'Tempo + data/hora', body: 'Recepcionista confere a previsão na tela' },
  },
];

/* ---------------------------------- seed ---------------------------------- */

if (!KEEP) reset();

console.log('1/6 · acessos');
const agencyId = insert('users', {
  email: 'admin@olha.ai',
  name: 'Equipe OLHA.AI',
  role: 'agency',
  phone: '(86) 99473-3976',
  pass_hash: hashPass('olha12345'),
});
run('UPDATE users SET role=?, email=? WHERE id=?', ['agency', 'admin@olha.ai', agencyId]);

const companyIds = [];
for (const [i, co] of COMPANIES.entries()) {
  const existing = get('SELECT id FROM clients WHERE name=?', [co.name]);
  const id = existing ? existing.id : insert('clients', {
    name: co.name, brand: co.brand, segment: co.segment, cnpj: co.cnpj, contact_name: co.contact_name,
    contact_email: co.contact_email, phone: co.phone, city: co.city, state: co.state, plan: co.plan,
    status: 'ativo', monthly_value: co.monthly_value, seats: co.seats, notes: co.notes,
  });
  companyIds.push(id);
  if (!existing && !get('SELECT id FROM users WHERE lower(email)=lower(?)', [co.contact_email]))
    insert('users', { email: co.contact_email.toLowerCase(), name: co.contact_name, role: 'client', client_id: id, phone: co.phone, pass_hash: hashPass('cliente123') });
  console.log(`   empresa ${i + 1}: ${co.name}`);
}

console.log('2/6 · pontos com localização');
const locationIds = {};
for (const [ci, co] of COMPANIES.entries()) {
  locationIds[ci] = [];
  for (const loc of co.locations) {
    if (get('SELECT id FROM locations WHERE client_id=? AND name=?', [companyIds[ci], loc.name])) continue;
    locationIds[ci].push(
      insert('locations', { client_id: companyIds[ci], ...loc, zip: null, notes: null })
    );
  }
}

console.log('3/6 · aparelhos');
const devicePlan = [
  [0, [['TV Fachada', 'tv', 'h'], ['Tablet Balcão', 'tablet', 'v'], ['Painel LED Vitrine', 'led', 'v']]],
  [1, [['TV Mezanino', 'tv', 'h'], ['TV Recepção', 'tv', 'h']]],
  [2, [['TV Sala de Espera', 'tv', 'h'], ['Tablet Agendamento', 'tablet', 'v'], ['Tablet Carro 01', 'tablet', 'h']]],
];
const deviceIds = [];
for (const [ci, list] of devicePlan) {
  for (const [li, item] of list.entries()) {
    const [name, type, orientation] = item;
    const locId = locationIds[ci][Math.min(li, locationIds[ci].length - 1)];
    const loc = get('SELECT * FROM locations WHERE id=?', [locId]);
    const code = `OLHA${(ci + 1).toString()}${(li + 1).toString().padStart(2, '0')}`;
    if (get('SELECT id FROM devices WHERE pairing_code=?', [code])) continue;
    const paired = !(ci === 2 && li === 2); // um aparelho fica pendente para demonstrar o fluxo
    const id = insert('devices', {
      uid: 'dev_' + code.toLowerCase() + '_' + Math.random().toString(36).slice(2, 8),
      client_id: companyIds[ci],
      location_id: locId,
      name,
      type,
      orientation,
      width: orientation === 'v' ? 1080 : 1920,
      height: orientation === 'v' ? 1920 : 1080,
      pairing_code: code,
      token: paired ? 'seed-' + code.toLowerCase() + '-' + Math.random().toString(36).slice(2, 10) : null,
      status: paired ? 'online' : 'pendente',
      paired_at: paired ? new Date(Date.now() - 864e5 * (3 + li)).toISOString().replace('T', ' ').slice(0, 19) : null,
      last_seen: paired ? new Date(Date.now() - (ci === 1 && li === 1 ? 3600e3 * 7 : 40e3)).toISOString().replace('T', ' ').slice(0, 19) : null,
      lat: loc?.lat ?? null,
      lng: loc?.lng ?? null,
      accuracy: loc ? 18 : null,
      geo_source: 'gps',
      geo_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
      battery: type === 'tablet' ? 60 + li * 12 : null,
      charging: type === 'tablet' ? 1 : null,
      os: type === 'tablet' ? 'Android 14 · WebView' : 'Android TV 12',
      app_version: '1.4.0',
      mode: 'playlist',
      uptime: 3600 * (4 + li),
    });
    deviceIds.push({ id, clientId: companyIds[ci], code, paired });
    if (paired) insert('device_logs', { device_id: id, type: 'paired', payload: { seed: true } });
  }
}

console.log('4/6 · peças de conteúdo');
for (const [ci, co] of COMPANIES.entries()) {
  const [c1, c2] = co.accent;
  for (const [mi, spec] of co.media.entries()) {
    const vertical = spec.vertical;
    const { file, bytes } = writeAsset(
      `demo-${ci + 1}-${mi + 1}`,
      poster({
        title: spec.title,
        sub: spec.sub,
        cta: spec.cta,
        brand: co.brand,
        tag: spec.tag,
        vertical,
        c1,
        c2,
        dark: spec.dark ?? false,
      })
    );
    if (get('SELECT id FROM media WHERE filename=?', [file])) continue;
    insert('media', {
      client_id: companyIds[ci],
      kind: 'image',
      title: spec.title,
      filename: file,
      mime: 'image/svg+xml',
      bytes,
      width: vertical ? 1080 : 1920,
      height: vertical ? 1920 : 1080,
      orientation: vertical ? 'v' : 'h',
      checksum: 'demo' + ci + mi,
      tags: spec.tag,
      created_by: agencyId,
    });
  }
  if (co.extra && !get('SELECT id FROM media WHERE client_id=? AND title=?', [companyIds[ci], co.extra.title])) {
    insert('media', {
      client_id: companyIds[ci],
      kind: co.extra.kind,
      title: co.extra.title,
      body: co.extra.body || null,
      url: co.extra.url || null,
      orientation: 'h',
      tags: 'dinamico',
      created_by: agencyId,
    });
  }
}
// widgets institucionais compartilhados pela biblioteca da agência
for (const [kind, title, body] of [
  ['clock', 'Relógio + data por extenso', null],
  ['weather', 'Previsão do tempo (7 dias)', null],
  ['news', 'Manchetes de esporte', 'https://globoesporte.globo.com/feed/rss/'],
  ['text', 'Chamada: campanha de inverno', 'Peças de inverno com até 40% off — só esta semana nas unidades participantes.'],
]) {
  if (get('SELECT id FROM media WHERE public=1 AND title=?', [title])) continue;
  insert('media', { client_id: null, public: 1, kind, title, body, url: body && body.startsWith('http') ? body : null, orientation: 'h', tags: 'biblioteca', created_by: agencyId });
}

console.log('5/6 · playlists, janelas e vinculações');
const D = (kind, title) => get('SELECT id FROM media WHERE title=? AND (client_id IS NULL OR kind=?)', [title, kind])?.id;
for (const [ci, co] of COMPANIES.entries()) {
  const clientId = companyIds[ci];
  if (get('SELECT id FROM playlists WHERE client_id=? AND name=?', [clientId, co.playlist])) continue;
  const items = all('SELECT id, kind, duration_ms FROM media WHERE client_id=? ORDER BY id', [clientId]);
  const orientation = co.media.some((m) => m.vertical) ? 'misto' : 'h';
  const pid = insert('playlists', {
    client_id: clientId,
    name: co.playlist,
    notes: `Montada pela OLHA.AI a partir do material de ${co.name}.`,
    orientation: orientation === 'misto' ? 'h' : 'h',
    bg: co.dark ? '#05070f' : '#0b1024',
    status: 'publicada',
    version: 3,
    published_at: new Date(Date.now() - 864e5).toISOString().replace('T', ' ').slice(0, 19),
    created_by: agencyId,
  });
  items.forEach((it, i) => insert('playlist_items', { playlist_id: pid, media_id: it.id, position: i, duration_ms: it.kind === 'video' ? null : 9000 }));
  insert('schedules', { playlist_id: pid, client_id: clientId, name: 'Abertura', days: '1,2,3,4,5', start_time: '08:00', end_time: '12:00', priority: 1, enabled: 1 });
  insert('schedules', { playlist_id: pid, client_id: clientId, name: 'Tarde/noite', days: '1,2,3,4,5,6', start_time: '13:00', end_time: '22:00', priority: 1, enabled: 1 });
  for (const lid of locationIds[ci]) insert('assignments', { client_id: clientId, playlist_id: pid, scope: 'location', scope_id: lid });
  // campanha de horário nobre (exemplo de prioridade maior + escopo só numa tela)
  if (ci === 0) {
    const nobre = insert('playlists', {
      client_id: clientId,
      name: 'Inove · Horário Nobre (oferta relâmpago)',
      notes: 'Só na TV Fachada, 18h–21h, prioridade acima da grade padrão.',
      orientation: 'h',
      status: 'publicada',
      version: 1,
      published_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
      created_by: agencyId,
    });
    const first = items[0];
    if (first) insert('playlist_items', { playlist_id: nobre, media_id: first.id, position: 0, duration_ms: 12000 });
    insert('schedules', { playlist_id: nobre, client_id: clientId, name: 'Horário nobre', days: '4,5,6', start_time: '18:00', end_time: '21:00', priority: 9, enabled: 1 });
    const dev = deviceIds.find((d) => d.clientId === clientId);
    if (dev) update('devices', dev.id, { playlist_id: nobre });
  }
}

console.log('6/6 · histórico de exibição (relatórios)');
for (const { id, clientId } of deviceIds) {
  const medias = all('SELECT id, kind FROM media WHERE client_id=?', [clientId]);
  if (!medias.length) continue;
  for (let d = 13; d >= 0; d--) {
    const day = new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
    const isWeekend = [0, 6].includes(new Date(day + 'T12:00').getDay());
    for (let h = 8; h < (isWeekend ? 18 : 22); h += 1) {
      if (Math.random() < 0.14) continue;
      const m = medias[h % medias.length];
      insert('playlog', {
        device_id: id,
        media_id: m.id,
        ms: 2_400_000 + Math.floor(Math.random() * 900_000),
        day,
        created_at: `${day} ${String(h).padStart(2, '0')}:${String(10 + (h % 40)).padStart(2, '0')}:00`,
      });
    }
  }
}

const summary = {
  clients: get('SELECT COUNT(*) n FROM clients').n,
  locations: get('SELECT COUNT(*) n FROM locations').n,
  devices: get('SELECT COUNT(*) n FROM devices').n,
  media: get('SELECT COUNT(*) n FROM media').n,
  playlists: get('SELECT COUNT(*) n FROM playlists').n,
  playlog: get('SELECT COUNT(*) n FROM playlog').n,
};
console.log('\nSeed concluído:', summary);
console.log('\n  Acesso da AGÊNCIA (você):  admin@olha.ai  /  olha12345');
for (const u of all("SELECT email,name FROM users WHERE role='client' ORDER BY id")) {
  console.log(`  Acesso do CLIENTE (${u.name}):  ${u.email}  /  cliente123`);
}
console.log('\n  Códigos de pareamento (use em /player):');
for (const d of all('SELECT pairing_code,name,status FROM devices ORDER BY id')) {
  console.log(`   ${d.pairing_code.padEnd(8)} ${d.name.padEnd(24)} ${d.status}`);
}
console.log('');
