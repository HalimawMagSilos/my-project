const toggleButton = document.getElementById("toggle");
const text = document.getElementById("message");

let isOn = false;

toggleButton.addEventListener("click", function(){
    isOn = !isOn;
    if (isOn) {
        text.textContent="On";
    } else {
       text.textContent="Off";
    }

});