"use client";

import { LED } from "@/components/horizon/LED";
import { Panel } from "@/components/horizon/Panel";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { PageHeader } from "@/components/shell/PageHeader";
import { API_URL } from "@/lib/api";
import { useHealth, useProviders } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

import { KeysPanel } from "./KeysPanel";

import styles from "./SettingsView.module.css";

const VIA_TEXT = {
  provider_key: "using your provider key",
  hud_gateway: "no provider key: routes through HUD's gateway and bills HUD credits",
  base_url: "any OpenAI-compatible server, set per run",
} as const;

export function SettingsView() {
  const { data: providers = [] } = useProviders();
  const health = useHealth();
  const { theme } = useTheme();

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Settings"
        title="Providers, connection, appearance"
        description="Add a provider key and Horizon can run that model. Keys stay on this machine."
      />

      <KeysPanel />

      <Panel eyebrow="Providers" title="What can run right now">
        <ul className={styles.providers}>
          {providers.map((p) => (
            <li key={p.agent_type} className={styles.provider}>
              <LED color={p.available ? "var(--status-success)" : "var(--status-idle)"} />
              <div className={styles.providerText}>
                <span className={styles.providerName}>{p.label}</span>
                <span className={styles.providerHint}>
                  {p.available && p.via ? VIA_TEXT[p.via] : `add a ${p.label.split(" ")[0]} key above to enable`}
                </span>
              </div>
              {p.key_env && <code className={styles.env}>{p.key_env}</code>}
            </li>
          ))}
        </ul>
      </Panel>

      <div className={styles.columns}>
        <Panel eyebrow="Connection" title="API">
          <dl className={styles.dl}>
            <dt>URL</dt>
            <dd className={styles.mono}>{API_URL}</dd>
            <dt>Status</dt>
            <dd>
              <span className={styles.inline}>
                <LED color={health.isSuccess ? "var(--status-success)" : "var(--status-error)"} />
                {health.isSuccess ? "connected" : "unreachable"}
              </span>
            </dd>
            <dt>hud SDK</dt>
            <dd className={styles.mono}>{health.data?.hud ?? "—"}</dd>
            <dt>Telemetry</dt>
            <dd>off: runs stay on this machine</dd>
          </dl>
        </Panel>

        <Panel eyebrow="Appearance" title="Theme">
          <div className={styles.inline}>
            <ThemeToggle />
            <span className={styles.themeLabel}>{theme === "dark" ? "Dusk" : "Dawn"}</span>
          </div>
          <p className={styles.hint}>
            Also reachable from the command palette (<kbd>⌘</kbd> <kbd>K</kbd>). Motion respects your
            system&apos;s reduced-motion setting.
          </p>
        </Panel>
      </div>
    </div>
  );
}
