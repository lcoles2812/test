// Shared chat configuration for all pages.
// Modes: "chatling", "gemini", or "beta"
window.COMMON_TABLE_CHAT_MODE = "chatling";

// Chatling embed configuration.
// Replace chatbotId with your real Chatling bot id.
window.COMMON_TABLE_CHATLING = {
	chatbotId: "7843314965",
	scriptSrc: "https://chatling.ai/js/embed.js"
};

// Existing Gemini backend configuration (used when mode is "gemini").
window.COMMON_TABLE_CHAT_ENDPOINT = "https://ais-pre-uanud6caph7jycyiiesi43-413938524988.asia-southeast1.run.app/api/chat";

// Optional live-model settings sent with each request.
window.COMMON_TABLE_CHAT_SETTINGS = {
	persona: "michelin",
	dietaryPreference: "none",
	difficulty: "intermediate",
	temperature: 0.7
};
