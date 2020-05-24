'use strict';
const output = document.getElementById("output");
const number_button = document.getElementById("number-button");
const array_button = document.getElementById("array-button");

function display(obj)
{
    output.innerText += JSON.stringify(obj) + "\n";
}

function broadcast(obj)
{
    display(obj);
}

number_button.addEventListener("click", () => broadcast(1));
array_button.addEventListener("click", () => broadcast([1, "two"]));