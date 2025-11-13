function fetchHeader() {
    header = fetch("header.html").then(response => {
        if (!response.ok) {
            throw new Error("Something went wrong during the fetch of the header");
        }
        return response.text();
    }).then(data => {
        document.getElementById("header").innerHTML += data
    })
};

window.addEventListener('DOMContentLoaded', fetchHeader);