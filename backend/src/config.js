// Semua konfigurasi dibaca dari environment variable (lihat .env.example)
const env = process.env;

function required(name) {
  const v = env[name];
  if (!v) {
    console.error(`[config] Environment variable ${name} wajib diisi.`);
    process.exit(1);
  }
  return v;
}

export const config = {
  port: Number(env.PORT || 3000),
  jwtSecret: required('JWT_SECRET'),
  encryptionKey: required('ENCRYPTION_KEY'),
  cookieSecure: env.COOKIE_SECURE === 'true',
  sessionHours: Number(env.SESSION_HOURS || 12),

  // Docker: lewat docker-socket-proxy (tcp://socket-proxy:2375) atau socket langsung
  dockerHost: env.DOCKER_HOST || 'unix:///var/run/docker.sock',

  // Alamat host NAS dilihat dari dalam container (untuk cek port TCP)
  hostCheckAddr: env.HOST_CHECK_ADDR || 'host.docker.internal',
  // IP NAS di LAN (untuk membuat link yang bisa diklik dari browser)
  nasLanIp: env.NAS_LAN_IP || '192.168.110.10',

  // Interval health check otomatis (detik)
  healthInterval: Number(env.HEALTH_INTERVAL || 120),
  healthTimeoutMs: Number(env.HEALTH_TIMEOUT_MS || 5000),

  // Mapping path host -> path di dalam container, format "hostPath:containerPath,..."
  // Dipakai untuk cek lokasi project ada/tidak & kapasitas disk.
  hostMounts: (env.HOST_MOUNTS || '/mnt/data:/host/data')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [hostPath, containerPath] = pair.split(':');
      return { hostPath, containerPath };
    }),
};
