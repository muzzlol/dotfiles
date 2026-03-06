import { homedir } from "os";
import { join } from "path";

const sounds = {
	bonk: "bonk.mp3",
	tuturu: "tuturu.mp3",
	none: null,
};

const activeSound = sounds.bonk;

export const NotificationPlugin = async ({ $, client }) => {
	// Check if a session is a main (non-subagent) session
	const playSound = async ($, filename) => {
		if (!filename) return;
		const path = join(homedir(), `.config/opencode/sounds/${filename}`);
		await $`afplay ${path}`;
	};

	const isMainSession = async (sessionID) => {
		try {
			const result = await client.session.get({ path: { id: sessionID } });
			const session = result.data ?? result;
			return !session.parentID;
		} catch {
			// If we can't fetch the session, assume it's main to avoid missing notifications
			return true;
		}
	};

	return {
		event: async ({ event }) => {
			// Only notify for main session events, not background subagents
			if (event.type === "session.idle") {
				const sessionID = event.properties.sessionID;
				if (await isMainSession(sessionID)) {
					await playSound($, activeSound);
				}
			}

			// Permission prompt created
			if (event.type === "permission.asked") {
				await playSound($, activeSound);
			}
		},
	};
};
