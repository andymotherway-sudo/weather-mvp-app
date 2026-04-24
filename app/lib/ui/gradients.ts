function getTopGradientFromWeather(code?: number | null) {
  // Open-Meteo style weather codes (works with what you're already using)

  if (code == null) {
    return ['rgba(120,180,255,0.18)', 'rgba(120,180,255,0.08)', 'rgba(0,0,0,0)'];
  }

  // ☀️ Clear / mostly clear
  if (code === 0) {
    return [
      'rgba(255,200,120,0.22)', // warm sun glow
      'rgba(255,200,120,0.10)',
      'rgba(0,0,0,0)',
    ];
  }

  // 🌤️ Partly cloudy
  if ([1, 2].includes(code)) {
    return [
      'rgba(180,210,255,0.20)',
      'rgba(180,210,255,0.08)',
      'rgba(0,0,0,0)',
    ];
  }

  // ☁️ Overcast
  if (code === 3) {
    return [
      'rgba(200,210,230,0.16)',
      'rgba(200,210,230,0.06)',
      'rgba(0,0,0,0)',
    ];
  }

  // 🌧️ Rain
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) {
    return [
      'rgba(120,160,220,0.18)',
      'rgba(120,160,220,0.08)',
      'rgba(0,0,0,0)',
    ];
  }

  // ⛈️ Storm
  if ([95, 96, 99].includes(code)) {
    return [
      'rgba(140,120,220,0.20)', // subtle purple energy
      'rgba(140,120,220,0.08)',
      'rgba(0,0,0,0)',
    ];
  }

  // ❄️ Snow
  if ([71, 73, 75, 85, 86].includes(code)) {
    return [
      'rgba(220,240,255,0.20)',
      'rgba(220,240,255,0.10)',
      'rgba(0,0,0,0)',
    ];
  }

  // 🌫️ Fog
  if ([45, 48].includes(code)) {
    return [
      'rgba(210,210,210,0.16)',
      'rgba(210,210,210,0.08)',
      'rgba(0,0,0,0)',
    ];
  }

  // fallback
  return ['rgba(120,180,255,0.18)', 'rgba(120,180,255,0.08)', 'rgba(0,0,0,0)'];
}