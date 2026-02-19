export default function Footer() {
  return (
    <footer className="px-6 py-16 border-t border-[var(--border)]">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-left">
            <div className="font-bold text-lg mb-1">agorio</div>
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

          <div className="flex items-center gap-6 text-sm text-[var(--muted)]">
            <a
              href="https://github.com/Nolpak14/agorio"
              className="hover:text-[var(--fg)] transition-colors"
              target="_blank"
              rel="noopener"
            >
              GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/@agorio/sdk"
              className="hover:text-[var(--fg)] transition-colors"
              target="_blank"
              rel="noopener"
            >
              npm
            </a>
            <a
              href="https://dev.to/ucptools/build-an-ai-shopping-agent-in-50-lines-of-typescript-ggd"
              className="hover:text-[var(--fg)] transition-colors"
              target="_blank"
              rel="noopener"
            >
              Dev.to
            </a>
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
