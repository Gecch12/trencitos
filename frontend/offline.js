"use strict";
if (navigator.language.startsWith("en")) {
  document.documentElement.lang = "en";
  document.getElementById("offlineMessage").textContent = "You need an Internet connection to join your games.";
  document.getElementById("retry").textContent = "Try again";
}
document.getElementById("retry").onclick = () => location.reload();
