import { homedir } from "node:os";
import { join } from "node:path";

const sounds = {
	bonk: "bonk.mp3",
	tuturu: "tuturu.mp3",
	none: null,
};

const activeSound = sounds.bonk;

const playSound = async (filename) => {
	if (!filename) return;

	const path = join(homedir(), ".config/opencode/sounds", filename);
	const process = Bun.spawn(["/usr/bin/afplay", path], {
		stderr: "ignore",
		stdout: "ignore",
	});
	await process.exited;
};

export default async function NotificationSoundPlugin({ client, directory }) {
	return {
		event: async ({ event }) => {
			if (event.type !== "session.idle" && event.type !== "permission.updated") return;

			const sessionID = event.properties?.sessionID ?? event.properties?.sessionId;
			if (!sessionID) return;

			try {
				const response = await client.session.get({ path: { id: sessionID } });
				const session = response?.data ?? response;

				// A global plugin is instantiated for each active location. Only the
				// owning instance should notify, and subagent completions stay quiet.
				if (session?.directory !== directory || session?.parentID) return;

				await playSound(activeSound);
			} catch (error) {
				console.error("notification plugin failed", error);
			}
		},
	};
}
