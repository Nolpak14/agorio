export default function Footer() {
  return (
    <footer className="px-6 py-16">
      <div className="gradient-divider mb-12" />
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-left">
            <div className="font-bold text-lg mb-1 font-mono tracking-tight">
              <span className="text-[var(--accent)]">ag</span>orio
            </div>
            <p className="text-sm text-[var(--muted)]">
              The open-source AI commerce agent toolkit.
              <br />
              Built for{' '}
              <a
                href="https://github.com/Universal-Commerce-Protocol/ucp"
                className="hover:text-[var(--fg)] transition-colors"
                target="_blank"
                rel="noopener"
              >
                UCP
              </a>{' '}
              and{' '}
              <a
                href="https://github.com/agentic-commerce-protocol/agentic-commerce-protocol"
                className="hover:text-[var(--fg)] transition-colors"
                target="_blank"
                rel="noopener"
              >
                ACP
              </a>
              .
            </p>
          </div>

          <div className="flex items-center gap-5">
            {/* GitHub */}
            <a
              href="https://github.com/Nolpak14/agorio"
              className="text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
              target="_blank"
              rel="noopener"
              aria-label="GitHub"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </a>
            {/* npm */}
            <a
              href="https://www.npmjs.com/package/@agorio/sdk"
              className="text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
              target="_blank"
              rel="noopener"
              aria-label="npm"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M0 7.334v8h6.666v1.332H12v-1.332h12v-8H0zm6.666 6.664H5.334v-4H3.999v4H1.335V8.667h5.331v5.331zm4 0v1.336H8.001V8.667h5.334v5.332h-2.669v-.001zm12.001 0h-1.33v-4h-1.336v4h-1.335v-4h-1.33v4h-2.671V8.667h8.002v5.331zM10.665 10H12v2.667h-1.335V10z" />
              </svg>
            </a>
            {/* Dev.to */}
            <a
              href="https://dev.to/ucptools/build-an-ai-shopping-agent-in-50-lines-of-typescript-ggd"
              className="text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
              target="_blank"
              rel="noopener"
              aria-label="Dev.to"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7.42 10.05c-.18-.16-.46-.23-.84-.23H6v4.36h.58c.37 0 .65-.08.84-.23.2-.16.3-.46.3-.9v-2.1c0-.44-.1-.74-.3-.9zM0 2v20h24V2H0zm8.1 12.54c-.35.42-.87.63-1.57.63H4.36V8.83h2.18c.69 0 1.21.21 1.57.63.35.41.53 1.03.53 1.84v2.4c0 .81-.18 1.43-.54 1.84zm4.37.63H10.3V8.83h2.17v1.25h-.88v1.74h.88v1.24h-.88v2.87h.88v1.24zM19.09 10h-2.22v1.74h1.36v1.25h-1.36v1.87h2.22v1.25h-3.34V8.83h3.34V10z" />
              </svg>
            </a>

            {/* TypeScript badge */}
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--border)] text-xs text-[var(--muted)]">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="#3178C6">
                <path d="M1.125 0C.502 0 0 .502 0 1.125v21.75C0 23.498.502 24 1.125 24h21.75c.623 0 1.125-.502 1.125-1.125V1.125C24 .502 23.498 0 22.875 0zm17.363 9.75c.612 0 1.154.037 1.627.111a6.38 6.38 0 0 1 1.306.34v2.458a3.95 3.95 0 0 0-.643-.361 5.093 5.093 0 0 0-.717-.26 5.453 5.453 0 0 0-1.426-.2c-.3 0-.573.028-.819.086a2.1 2.1 0 0 0-.623.242c-.17.104-.3.229-.393.374a.888.888 0 0 0-.14.49c0 .196.053.373.156.529.104.156.252.304.443.444s.42.276.69.394.57.224.904.32a9.74 9.74 0 0 1 1.062.45 4.32 4.32 0 0 1 .864.568c.248.217.44.48.575.788.136.308.204.665.204 1.07 0 .593-.107 1.094-.322 1.504-.215.409-.517.74-.905.995a4.08 4.08 0 0 1-1.397.58 7.83 7.83 0 0 1-1.79.186c-.618 0-1.214-.066-1.789-.198-.576-.131-1.089-.326-1.539-.586v-2.65a4.71 4.71 0 0 0 .786.521c.3.167.612.3.937.399.325.099.65.169.975.209a5.2 5.2 0 0 0 .87.03c.3 0 .573-.034.819-.103a2.09 2.09 0 0 0 .623-.289.89.89 0 0 0 .393-.415c.091-.17.137-.371.137-.602 0-.213-.058-.396-.173-.548a1.89 1.89 0 0 0-.494-.433 4.7 4.7 0 0 0-.764-.381 22.93 22.93 0 0 0-.984-.367c-.397-.126-.774-.281-1.132-.465a4.1 4.1 0 0 1-.915-.616 2.72 2.72 0 0 1-.611-.822 2.58 2.58 0 0 1-.22-1.097c0-.55.108-1.026.322-1.425.215-.4.513-.727.893-.982a4.1 4.1 0 0 1 1.353-.58 7.24 7.24 0 0 1 1.704-.196zm-9.113.484v1.77H7.077v7.996H5.142v-7.996H2.8V10.234h6.688z" />
              </svg>
              TypeScript
            </span>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-[var(--border)] text-center text-xs text-[var(--muted)]">
          MIT License. Not affiliated with Google, Shopify, OpenAI, or Stripe.
          UCP and ACP are open standards maintained by their respective organizations.
        </div>
      </div>
    </footer>
  );
}
