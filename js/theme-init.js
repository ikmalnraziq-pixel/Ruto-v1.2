// Dijalankan sinkron di <head> agar tema tidak berkedip. Hanya preferensi non-sensitif.
try {
  const th = localStorage.getItem('ruto-theme');
  if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th;
  const lg = localStorage.getItem('ruto-lang');
  if (lg === 'id' || lg === 'en') document.documentElement.lang = lg;
} catch { /* storage diblokir */ }
