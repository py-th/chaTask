const PRIORITY_COLORS = {
  high: '#ffcccc',
  medium: '#cce5ff',
  low: '#ccffcc',
  default: 'rgba(255,249,196,0.95)'
};

const STATUS_COLORS = {
  completed: '#4CAF50',
  in_progress: '#FF9800',
  pending: '#2196F3',
  overdue: '#f44336'
};

const STICKY_TEMPLATES = {
  classic: {
    name: '经典',
    backgroundColor: 'rgba(255,249,196,0.95)',
    textColor: '#333333',
    borderColor: '#e0c060'
  },
  simple: {
    name: '简约',
    backgroundColor: 'rgba(255,255,255,0.9)',
    textColor: '#333333',
    borderColor: '#cccccc'
  },
  cute: {
    name: '可爱',
    backgroundColor: 'rgba(255,223,223,0.95)',
    textColor: '#5d4e60',
    borderColor: '#ffb6c1'
  },
  ocean: {
    name: '海洋',
    backgroundColor: 'rgba(200,230,255,0.95)',
    textColor: '#1a3a5c',
    borderColor: '#87ceeb'
  },
  forest: {
    name: '森林',
    backgroundColor: 'rgba(220,255,220,0.95)',
    textColor: '#1a4a2a',
    borderColor: '#90ee90'
  },
  sunset: {
    name: '日落',
    backgroundColor: 'rgba(255,220,180,0.95)',
    textColor: '#5c3d2e',
    borderColor: '#ffa07a'
  }
};

function getPriorityColor(priority) {
  return PRIORITY_COLORS[priority] || PRIORITY_COLORS.default;
}

function getStatusColor(status) {
  return STATUS_COLORS[status] || '#666666';
}

function getTemplateColors(templateName) {
  return STICKY_TEMPLATES[templateName] || STICKY_TEMPLATES.classic;
}

function hexToRgba(hex, alpha = 1) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
    a: alpha
  } : null;
}

function rgbaToString(r, g, b, a = 1) {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function hexToRgbaString(hex, alpha = 1) {
  const rgba = hexToRgba(hex, alpha);
  return rgba ? rgbaToString(rgba.r, rgba.g, rgba.b, rgba.a) : hex;
}

function adjustOpacity(color, opacity) {
  if (color.startsWith('rgba(')) {
    const match = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+?\)/);
    if (match) {
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${opacity})`;
    }
  } else if (color.startsWith('rgb(')) {
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${opacity})`;
    }
  } else if (color.startsWith('#')) {
    return hexToRgbaString(color, opacity);
  }
  return color;
}

function lightenColor(color, percent) {
  if (color.startsWith('#')) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (
      0x1000000 +
      (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255)
    ).toString(16).slice(1);
  }
  return color;
}

module.exports = {
  PRIORITY_COLORS,
  STATUS_COLORS,
  STICKY_TEMPLATES,
  getPriorityColor,
  getStatusColor,
  getTemplateColors,
  hexToRgba,
  rgbaToString,
  hexToRgbaString,
  adjustOpacity,
  lightenColor
};