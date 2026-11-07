import { Also, Diff, Explanation, Files, Flow, Note, Opening, Ref, Specifics, Validation } from "explain";

export default function Page() {
  return (
    <Explanation source="pr:14171">
      <Opening>
        <p>
          Internal scripts that call <code>getScriptSecrets</code> now find their own Infisical credential, so a token
          pasted into <code>config/.env</code> is no longer required. App services that use <code>@greptile/secrets</code>{" "}
          are unchanged.
        </p>
        <Flow
          label="Where the change sits when a script asks for secrets"
          nodes={[
            { id: "script", label: "A script calls getScriptSecrets", unchanged: true },
            { id: "copy", label: "Copy config/.env into process.env", mark: "-", note: "config/.env is no longer copied into the environment" },
            { id: "pick", label: "Pick a credential", mark: "~", note: "The first usable credential wins" },
            { id: "cli", label: "Ask the infisical CLI", mark: "+", note: "The CLI login session is a credential source" },
            { id: "none", label: "Throw a credential error", mark: "~", note: "No credential is now a credential error" },
            { id: "fetch", label: "Fetch secrets from Infisical", unchanged: true },
          ]}
          edges={[
            { from: "script", to: "copy", label: "before", dashed: true },
            { from: "script", to: "pick", label: "now" },
            { from: "pick", to: "cli", label: "no token or identity" },
            { from: "pick", to: "fetch", label: "found one" },
            { from: "pick", to: "none", label: "none usable" },
          ]}
        />
      </Opening>

      <Note mark="~" risk="medium" title="The first usable credential wins">
        <Flow
          label="The order getScriptSecrets tries Infisical credentials in"
          nodes={[
            { id: "env", label: "Token in environment", mark: "~", code: { file: "internal/secrets.ts", symbol: "resolveInfisicalCredentials", match: "const envToken" } },
            { id: "id", label: "Machine identity", mark: "+", code: { file: "internal/secrets.ts", symbol: "resolveInfisicalCredentials", match: "if (clientId && clientSecret)" } },
            { id: "cli", label: "infisical login session", mark: "+", code: { file: "internal/secrets.ts", symbol: "getInfisicalCliToken" } },
            { id: "cfg", label: "Token in config/.env", mark: "~" },
            { id: "use", label: "Use it" },
            { id: "none", label: "Throw: no usable credentials", mark: "~" },
          ]}
          edges={[
            { from: "env", to: "use", label: "unexpired" },
            { from: "env", to: "id", label: "missing or expired" },
            { from: "id", to: "use", label: "ID and secret set" },
            { from: "id", to: "cli", label: "otherwise" },
            { from: "cli", to: "use", label: "prints a token" },
            { from: "cli", to: "cfg", label: "otherwise" },
            { from: "cfg", to: "use", label: "unexpired" },
            { from: "cfg", to: "none", label: "otherwise" },
          ]}
        />
        <p>
          A machine identity set in the environment beats your own login, so a developer who exports one gets that
          identity's role instead of their own access. The credential is{" "}
          <Ref file="internal/secrets.ts" symbol="getInfisicalSecretsForEnvironment" match="infisicalCredentials ??= resolveInfisicalCredentials()">
            resolved once per process
          </Ref>{" "}
          and reused for local, staging and prod;{" "}
          <Ref file="internal/secrets.ts" symbol="getInfisicalSecretsForEnvironment" match="infisicalCredentials = undefined">
            a failed fetch makes the next call resolve again
          </Ref>
          .
        </p>
        <Specifics summary="1 interface, expiry rule, bootstrap-env order">
          <Diff>{`- token and project ID read from process.env, after copying them in from config/.env
+ resolveInfisicalCredentials(): env token > client ID + secret > infisical CLI > config/.env token`}</Diff>
          <ul>
            <li>
              <Ref file="internal/secrets.ts" symbol="getTokenExpiry">
                Expiry comes from the token's JWT <code>exp</code> claim
              </Ref>
              . A token that isn't a JWT, or has no <code>exp</code>, counts as unexpired.
            </li>
            <li>
              A skipped expired token is listed in the final error as <code>INFISICAL_ACCESS_TOKEN expired at &lt;ISO time&gt;</code>.
            </li>
            <li>
              <Ref file="internal/secrets.ts" symbol="resolveInfisicalCredentials" match="if (clientId && clientSecret)">
                Setting only one of <code>INFISICAL_CLIENT_ID</code> and <code>INFISICAL_CLIENT_SECRET</code> is ignored
              </Ref>
              , and the error doesn't list it.
            </li>
            <li>
              Nine scripts import <code>internal/cli/lib/bootstrap-env</code>, which copies all of <code>config/.env</code> into{" "}
              <code>process.env</code> first. For them a pasted token is step 1, ahead of the machine identity and the login.
            </li>
          </ul>
        </Specifics>
      </Note>

      <Note mark="~" risk="medium" title="No credential is now a credential error">
        <Flow
          label="What getScriptSecrets does when no credential is usable"
          nodes={[
            { id: "res", label: "Resolve a credential" },
            { id: "fetch", label: "Fetch from Infisical", unchanged: true },
            { id: "fb", label: "Fallback flag on and every key in process.env?" },
            { id: "env", label: "Use process.env", unchanged: true },
            { id: "throw", label: "Throw: No usable Infisical credentials", mark: "~" },
          ]}
          edges={[
            { from: "res", to: "fetch", label: "found" },
            { from: "res", to: "fb", label: "none usable" },
            { from: "fb", to: "env", label: "yes" },
            { from: "fb", to: "throw", label: "no" },
          ]}
        />
        <p>
          Calls that succeeded before still succeed; a call with no credentials fails with a message that says what to
          do. For scripts that pass <code>allowEnvFallbackForInfisical</code>, a working <code>infisical login</code> now
          fetches from Infisical, and its values replace the same keys in <code>process.env</code>.
        </p>
        <Specifics summary="old and new message, partial environment">
          <Diff file="internal/secrets.ts" symbol="resolveInfisicalCredentials" match="No usable Infisical credentials" />
          <ul>
            <li>
              With the fallback flag on and only some keys in <code>process.env</code>, the error was "Missing required
              secrets for &lt;env&gt; from infisical/process.env"; it is now the credential error.
            </li>
          </ul>
        </Specifics>
      </Note>

      <Note mark="+" risk="medium" title="The CLI login session is a credential source">
        <Flow
          label="How step 3 gets a token from the infisical CLI"
          direction="right"
          nodes={[
            { id: "path", label: "infisical on PATH?" },
            { id: "run", label: "infisical user get token", mark: "+", code: { file: "internal/secrets.ts", symbol: "getInfisicalCliToken", match: "Bun.spawn" } },
            { id: "use", label: "Use the token" },
            { id: "skip", label: "Skip, keep the reason" },
          ]}
          edges={[
            { from: "path", to: "run", label: "yes" },
            { from: "path", to: "skip", label: "no" },
            { from: "run", to: "use", label: "exit 0 with a token" },
            { from: "run", to: "skip", label: "otherwise" },
          ]}
        />
        <p>
          A logged-out CLI{" "}
          <Ref file="internal/secrets.ts" symbol="getInfisicalCliToken" match="stdin: 'ignore'">
            exits at once instead of opening its login prompt
          </Ref>
          . The CLI token isn't expiry-checked, so an
          expired session fails at the request instead of falling through to <code>config/.env</code> (unconfirmed:
          whether the CLI refreshes the token itself).
        </p>
        <Specifics summary="command, skip reason">
          <ul>
            <li>
              Runs <code>infisical user get token --plain --silent</code> once per process, with stdin closed.
            </li>
            <li>The skip reason strips ANSI codes and collapses newlines before it goes into the error.</li>
          </ul>
        </Specifics>
      </Note>

      <Note mark="-" risk="low" title="config/.env is no longer copied into the environment">
        <p>
          <code>getScriptSecrets</code>{" "}
          <Ref file="internal/secrets.ts" symbol="loadInfisicalBootstrapEnv">
            used to write the token, project ID and <code>INFISICAL_ENVIRONMENT</code> from <code>config/.env</code> into{" "}
            <code>process.env</code>
          </Ref>
          ; it now reads the file only when it needs a value. No
          script relied on those variables afterwards.
        </p>
      </Note>

      <Also>
        <ul>
          <li>
            The project ID is <code>INFISICAL_PROJECT_ID</code> in the environment, then in <code>config/.env</code>, then the
            Greptilia project, read on every fetch. <code>internal/secrets.ts</code> exports it, and{" "}
            <Ref file="internal/cli/agentvault/lib.ts">
              <code>agentvault</code> imports it instead of keeping its own copy
            </Ref>
            .
          </li>
          <li>
            Provider errors are rewrapped as <code>Infisical request using &lt;source&gt; failed: &lt;message&gt;</code>, with the
            original as <code>cause</code>.
          </li>
          <li>
            The setup tutorial's{" "}
            <Ref file="docs/content/tutorials/setup-greptilia.md" symbol="Set Up Infisical Access Token">
              sample <code>config/.env</code>
            </Ref>{" "}
            now shows the project ID from <code>config/.env.example</code>.
          </li>
        </ul>
      </Also>

      <Files />

      <Validation>
        <p>
          CI reported Typecheck, Unit Tests and Integration Tests passing; nothing was run for this page. Untested against
          real Infisical: the machine-identity login, and what <code>infisical user get token</code> returns near expiry.
        </p>
      </Validation>
    </Explanation>
  );
}
