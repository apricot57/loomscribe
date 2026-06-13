export function safeAsync(fn) {
    return function (...args) {
        Promise.resolve(fn(...args)).catch((err) => {
            console.error("Unhandled async error caught by safeAsync boundary:", err);
        });
    };
}
