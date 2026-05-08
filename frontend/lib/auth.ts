export const logout = () => {
  // Clear stored user
  localStorage.removeItem("user");

  // Remove token cookie
  document.cookie = "token=; Max-Age=0; path=/";

  // Redirect to login
  window.location.href = "/login";
};