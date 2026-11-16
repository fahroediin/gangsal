// Dimuat di <head> sebelum CSS dirender supaya tidak berkedip saat tema gelap dipilih.
(function () {
  try {
    var t = localStorage.getItem("gangsal-theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
