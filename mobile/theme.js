// theme.js
export const colors = {
  bg: '#0B0F14',
  card: '#111827',
  subtle: '#6B7280',
  text: '#E5E7EB',
  primary: '#22C55E',   // green accent
  accent: '#3B82F6',    // blue for links/secondary
  danger: '#EF4444',
  border: 'rgba(255,255,255,0.08)',
};
export const radii = { sm: 10, md: 14, lg: 20, xl: 28 };
export const spacing = (n) => n * 8;
export const shadow = {
  card: { shadowColor:'#000', shadowOpacity:0.25, shadowRadius:10, elevation:6 },
};
export const fonts = {
  h1: { fontSize: 24, fontWeight: '800' },
  h2: { fontSize: 18, fontWeight: '700' },
  p:  { fontSize: 14, fontWeight: '500' },
  small: { fontSize: 12, fontWeight: '600' },
};
