'use strict';
const number_div = document.getElementById("number");
const plus_button = document.getElementById("plus-button");
const minus_button = document.getElementById("minus-button");

var socket = io();

var number = 0;

function updateBoard(move)
{
    number = move;
    number_div.innerText = "" + number;
}

function makeGameMove(move)
{
    updateBoard(move);
    socket.emit('game-move made', move);
}

socket.on('game-move', (move) =>
    updateBoard(move)
);

plus_button.addEventListener("click", () => makeGameMove(number + 1));
minus_button.addEventListener("click", () => makeGameMove(number - 1));