document.addEventListener("DOMContentLoaded", function () {
  Array.from(document.getElementsByClassName("fetch-form")).forEach((element) => {
    element.onsubmit = async (e) => {
      e.preventDefault();
      const params = new URLSearchParams([...new FormData(e.target).entries()]);
      fetch(document.getElementById(e.target.id).action, {
        method: document.getElementById(e.target.id).method,
        body: params,
        headers: {"kbn-xsrf": "reporting"}
      }).then(function (response) {
        if (response.ok) {
          response.text().then((text) => {
            location.replace(text)
          })
        } else {
          response.json().then((json) => {
            if (response.status === 403) {
              if (document.getElementById("alert").classList.contains("hidden")) {
                document.getElementById("alert").classList.remove("hidden");
              }
              document.getElementById("alert-message").innerHTML = json.message;
            } else {
              console.log(json.type, json.message)
            }
          })
        }
      })
    }
  })
});