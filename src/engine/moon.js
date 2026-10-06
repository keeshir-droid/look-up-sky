// The moon: tonight's phase from a date, and the tiny moon icon that sits after the date (PLAN.md 6.5).
// Plain functions; nothing here touches document/window at load time (loads in Node).
//
//   LU.moon.phase(ms) -> { age, fraction, waxing, name }
//       age       days since the last new moon (0 .. 29.53), from the new moon of 2000-01-06 18:14 UTC
//       fraction  illuminated share of the disc, 0 (new) .. 1 (full)  = (1 - cos(2*pi*age/29.53)) / 2
//       waxing    age < half a cycle
//       name      "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous", "Full Moon", "Waning Gibbous",
//                 "Last Quarter", "Waning Crescent"
//       (ms of 0 or anything that is not a date means "now")
//   LU.moon.draw(ctx, x, y, diameter, ms, color)
//       (x, y) is the CENTRE of the disc. The dark part is `color` at 35%, the lit part is `color` at full strength,
//       with the terminator as an ellipse. Lit side on the RIGHT while waxing (northern hemisphere); flipped when the
//       phone's time zone is in the southern hemisphere (LU.moon.isSouthern).
//       Any CSS colour string works. An optional 7th argument {southern: true|false} overrides the time-zone guess.
//   LU.moon.isSouthern(timeZone?) -> boolean       (default: the phone's own time zone)
//   LU.moon.shape(ms, southern?) -> { litRight, c }  the numbers draw() uses (for tests)
(function () {
  const LU = (globalThis.LU = globalThis.LU || {});

  const SYNODIC = 29.530588853;
  const EPOCH = Date.UTC(2000, 0, 6, 18, 14, 0); // a known new moon
  const DAY = 86400000;

  // A short list is enough (PLAN.md 6.5): time zones whose names begin with one of these are south of the equator.
  const SOUTHERN = [
    "Australia/", "Antarctica/", "Pacific/Auckland", "Pacific/Chatham", "Pacific/Fiji", "Pacific/Tongatapu", "Pacific/Apia",
    "Pacific/Noumea", "Pacific/Port_Moresby", "Pacific/Tahiti", "Pacific/Efate", "Pacific/Norfolk", "Pacific/Guadalcanal",
    "America/Sao_Paulo", "America/Argentina", "America/Buenos_Aires", "America/Santiago", "America/Montevideo",
    "America/La_Paz", "America/Lima", "America/Asuncion", "America/Bahia", "America/Recife", "America/Fortaleza",
    "America/Belem", "America/Manaus", "America/Campo_Grande", "America/Cuiaba", "America/Porto_Velho", "America/Maceio",
    "America/Cordoba", "America/Mendoza", "Atlantic/Stanley",
    "Africa/Johannesburg", "Africa/Maputo", "Africa/Harare", "Africa/Lusaka", "Africa/Windhoek", "Africa/Gaborone",
    "Africa/Maseru", "Africa/Mbabane", "Africa/Luanda", "Africa/Lubumbashi", "Africa/Blantyre", "Africa/Dar_es_Salaam",
    "Indian/Mauritius", "Indian/Reunion", "Indian/Antananarivo", "Indian/Comoro", "Indian/Mayotte"
  ];

  function isSouthern(tz) {
    if (tz === undefined) {
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { tz = ""; }
    }
    tz = String(tz || "");
    for (let i = 0; i < SOUTHERN.length; i++) if (tz.indexOf(SOUTHERN[i]) === 0) return true;
    return false;
  }

  function nowIfEmpty(ms) {
    return (ms === undefined || ms === null || ms === 0 || !isFinite(ms)) ? Date.now() : +ms;
  }

  function nameOf(age) {
    const c = age / SYNODIC; // 0 .. 1
    if (c < 1 / 16 || c >= 15 / 16) return "New Moon";
    if (c < 3 / 16) return "Waxing Crescent";
    if (c < 5 / 16) return "First Quarter";
    if (c < 7 / 16) return "Waxing Gibbous";
    if (c < 9 / 16) return "Full Moon";
    if (c < 11 / 16) return "Waning Gibbous";
    if (c < 13 / 16) return "Last Quarter";
    return "Waning Crescent";
  }

  function phase(ms) {
    ms = nowIfEmpty(ms);
    let age = ((ms - EPOCH) / DAY) % SYNODIC;
    if (age < 0) age += SYNODIC;
    const fraction = (1 - Math.cos(2 * Math.PI * age / SYNODIC)) / 2;
    return { age: age, fraction: fraction, waxing: age < SYNODIC / 2, name: nameOf(age) };
  }

  function shape(ms, southern) {
    const p = phase(ms);
    const south = southern === undefined ? isSouthern() : !!southern;
    // lit on the right while waxing in the north; the southern sky is turned upside down, so it flips
    const litRight = south ? !p.waxing : p.waxing;
    return { litRight: litRight, c: 1 - 2 * p.fraction, fraction: p.fraction, waxing: p.waxing };
  }

  function draw(ctx, x, y, diameter, ms, color, opts) {
    if (!ctx || !(diameter > 0)) return;
    const south = opts && opts.southern !== undefined ? !!opts.southern : undefined;
    const s = shape(ms, south);
    const r = diameter / 2;
    ctx.save();
    ctx.fillStyle = color || "#ffffff";
    // the dark part of the disc
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * 0.35;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = a0;
    // the lit part: the lit half circle, then back along the terminator (an ellipse with x radius |c| * r)
    if (s.fraction > 0.004) {
      const sgn = s.litRight ? 1 : -1, steps = 36;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const a = -Math.PI / 2 + Math.PI * i / steps;
        const X = x + sgn * r * Math.cos(a), Y = y + r * Math.sin(a);
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      for (let i = 0; i <= steps; i++) {
        const a = Math.PI / 2 - Math.PI * i / steps;
        ctx.lineTo(x + sgn * s.c * r * Math.cos(a), y + r * Math.sin(a));
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  LU.moon = { phase: phase, draw: draw, isSouthern: isSouthern, shape: shape, SYNODIC: SYNODIC, EPOCH: EPOCH };
})();
