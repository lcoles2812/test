// Shared chat configuration for all pages.
// Switch mode to "gemini" and set endpoint when your backend is ready.
window.COMMON_TABLE_CHAT_MODE = "gemini";
window.COMMON_TABLE_CHAT_ENDPOINT = "https://ais-pre-uanud6caph7jycyiiesi43-413938524988.asia-southeast1.run.app/api/chat";

// Optional live-model settings sent with each request.
window.COMMON_TABLE_CHAT_SETTINGS = {
	persona: "michelin",
	dietaryPreference: "none",
	difficulty: "intermediate",
	temperature: 0.7
};
