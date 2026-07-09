import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    remotePatterns: [
      // Vercel Blob URLs
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
      // Avatares do WhatsApp vindos do Uazapi
      { protocol: 'https', hostname: '*.uazapi.com' },
    ],
  },
  // Variáveis de ambiente que precisam ser acessíveis no cliente
  env: {
    NEXT_PUBLIC_PUSHER_KEY: process.env.NEXT_PUBLIC_PUSHER_KEY!,
    NEXT_PUBLIC_PUSHER_CLUSTER: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  },
  // O binário do ffmpeg-static (usado pra converter áudio pro formato que a Meta
  // aceita, ver src/lib/audioConvert.ts) é referenciado em runtime via path calculado
  // — sem isso o file tracing da Vercel pode não empacotar o binário na function e
  // funcionar só localmente.
  outputFileTracingIncludes: {
    '/api/leads/[id]/messages': ['./node_modules/ffmpeg-static/**'],
  },
}

export default config
