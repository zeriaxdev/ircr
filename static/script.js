const TENOR_API_KEY = "AIzaSyAjpqG6ASenoeOI04yZiPuM4RqbgkehzUk";

let roomListDiv = document.getElementById("room-list");
let messagesDiv = document.getElementById("messages");
let newMessageForm = document.getElementById("new-message");
let newRoomForm = document.getElementById("new-room-form");
let statusDiv = document.getElementById("status");

let roomTemplate = document.getElementById("room");
let messageTemplate = document.getElementById("message");

let messageField = newMessageForm.querySelector("#message");
let usernameField = document.querySelector("#user");
let usernameDisplay = document.querySelector("#username-display");

let overlay = document.querySelector("#overlay");

let currentTime = new Date();
let hours = currentTime.getHours();
let minutes = currentTime.getMinutes();

// Make sure the hours and minutes values have two digits
hours = hours.toString().padStart(2, "0");
minutes = minutes.toString().padStart(2, "0");
let time = `${hours}:${minutes}`;

if (usernameField == null) {
  usernameField = "guest";
}
let roomNameField = newRoomForm.querySelector("#name");

const default_username = "guest";

var STATE = {
  room: "general",
  rooms: {},
  connected: false,
  username: default_username,
  connected_people: 0,
  typing: false,
};

// Convert a URL string into a clickable link
function urlify(text) {
  var urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, function (url) {
    return '<a class="url" href="' + url + '">' + url + "</a>";
  });
}

// Convert "\n" into a <br> tag
function newlineify(text) {
  return text.replace(/\n/g, "");
}

// Generate a color from a "hash" of a string. Thanks, internet.
function hashColor(str) {
  let hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }

  return `hsl(${hash % 360}, 100%, 70%)`;
}

function sanitize(html) {
  const allowedElements = ["b", "i", "em", "strong", "a", "br", "pre", "code"];
  const allowedAttributes = ["href"];

  let container = document.createElement("div");
  container.innerHTML = html;

  let elements = container.querySelectorAll("*");
  for (let i = 0; i < elements.length; i++) {
    let element = elements[i];
    if (!allowedElements.includes(element.tagName.toLowerCase())) {
      element.parentNode.removeChild(element);
      continue;
    }

    let attributes = element.attributes;
    for (let j = attributes.length - 1; j >= 0; j--) {
      let attribute = attributes[j];
      if (!allowedAttributes.includes(attribute.name.toLowerCase())) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  return container.innerHTML;
}

function scrollToBottom() {
  document
    .getElementById("content")
    .scrollTo(0, document.getElementById("content").scrollHeight);
}

function formatText(text) {
  const boldRegex = /\*\*(.+?)\*\*/g;
  const italicRegex = /_(.+?)_/g;
  const underlineRegex = /__(.+?)__/g;
  const strikethroughRegex = /~~(.+?)~~/g;
  let formattedText = text;

  formattedText = formattedText.replace(boldRegex, "<b>$1</b>");
  formattedText = formattedText.replace(italicRegex, "<i>$1</i>");
  formattedText = formattedText.replace(underlineRegex, "<u>$1</u>");
  formattedText = formattedText.replace(strikethroughRegex, "<s>$1</s>");

  return formattedText;
}

function simplify(str) {
  return str.normalize("NFD").replace(/[^\x00-\x7F]/g, "");
}

function gifify(str, parentNode) {
  const regex = /https:\/\/media\.tenor\.com\/[a-zA-Z0-9]+\/.*\.gif/;
  if (regex.test(str)) {
    const img = document.createElement("img");
    img.src = str;
    img.className = "gif";

    parentNode.appendChild(img);
    return;
  }

  return str;
}

function sanitizeInput() {
  const input = document.getElementById("name");
  const simplifiedInput = simplify(input.value);
  const sanitizedInput = simplifiedInput
    .replace(/[^a-zA-Z0-9\s_-]/g, "")
    .replace(/\s/g, "-"); // Remove any invalid characters and replace spaces with hyphens
  input.value = sanitizedInput; // Update the input with the sanitized value
}

function convertCodeBlock(text) {
  // Find the position of the opening and closing triple backticks
  const startIndex = text.indexOf("```");
  let endIndex = text.lastIndexOf("```");

  // Extract the language specified between the triple backticks
  const language = text
    .substring(startIndex + 3, text.indexOf("\n", startIndex))
    .trim();
  // const codeBlockText = text.substring(endIndex + 3).trim().replace(/<br>/g, "\n");

  // Replace the entire code block text with a pre element that contains a code element
  const codeBlockHTML = `<pre><code class="language-${language}">${text
    .substring(endIndex)
    .trim()}</code></pre>`;
  return text.substring(0, startIndex) + codeBlockHTML;
}

function markdownToHtml(markdown) {
  const blocks = markdown.split(/```([a-zA-Z]*)?/); // Split the string into blocks using the code block delimiter
  let html = "";
  if (blocks.length > 0) {
    // Make sure the blocks array has at least one element
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (!block) {
        // Skip blocks that are undefined
        continue;
      }
      if (i % 2 === 0) {
        // Process non-code blocks
        html += block; // Add the block to the HTML string as-is
      } else {
        // Process code blocks
        const language = block.match(/^([a-zA-Z]*)?/)[1] || ""; // Extract the language from the block
        const code = block.replace(/^([a-zA-Z]*)?/, "").replace(/^```$/m, ""); // Extract the code from the block
        console.log(code, language);
        html += `<pre><code class="language-${language}">${code}</code></pre>`; // Add the HTML code block to the HTML string
      }
    }
  }
  return html;
}

function saveState() {
  localStorage.setItem("username", STATE.username);
  localStorage.setItem("rooms", JSON.stringify(Object.keys(STATE.rooms)));
}

function restoreState() {
  STATE.username = localStorage.getItem("username") || "";
  STATE.rooms = JSON.parse(localStorage.getItem("rooms")) || [];

  STATE.rooms.forEach(addRoom);
  if (STATE.username) {
    usernameField.value = STATE.username || default_username;
  }
}

// Add a new room `name` and change to it. Returns `true` if the room didn't
// already exist and false otherwise.
function addRoom(name) {
  if (STATE[name]) {
    changeRoom(name);
    return false;
  }

  var node = roomTemplate.content.cloneNode(true);
  var room = node.querySelector(".room");
  room.addEventListener("click", () => changeRoom(name), scrollToBottom());
  room.textContent = name;
  room.dataset.name = name;
  roomListDiv.appendChild(node);

  STATE[name] = [];
  changeRoom(name);
  saveState();

  return true;
}

// Change the current room to `name`, restoring its messages.
function changeRoom(name) {
  if (STATE.room == name) return;

  var newRoom = roomListDiv.querySelector(`.room[data-name='${name}']`);
  var oldRoom = roomListDiv.querySelector(`.room[data-name='${STATE.room}']`);
  if (!newRoom || !oldRoom) return;

  STATE.room = name;
  oldRoom.classList.remove("active");
  newRoom.classList.add("active");

  messagesDiv.querySelectorAll(".message").forEach((msg) => {
    messagesDiv.removeChild(msg);
  });

  STATE[name].forEach((data) =>
    addMessage(name, data.username, data.message, data.time)
  );

  messageField.focus();

  scrollToBottom();
}

// Add `message` from `username` to `room`. If `push`, then actually store the
// message. If the current room is `room`, render the message.
function addMessage(room, username, message, time, push = false) {
  if (push) {
    STATE[room].push({ username, message, time });
  }

  if (STATE.room == room) {
    var node = messageTemplate.content.cloneNode(true);

    let usernameNode = node.querySelector(".message .username");
    let textNode = node.querySelector(".message .text");

    usernameNode.textContent = username;
    usernameNode.style.color = hashColor(username);
    textNode.innerHTML = urlify(newlineify(markdownToHtml(message)));
    node.querySelector(".message .timestamp").textContent = time;

    // textNode.innerHTML = textNode.textContent, textNode;

    messagesDiv.appendChild(node);
  }

  scrollToBottom();
}

// Subscribe to the event source at `uri` with exponential backoff reconnect.
function subscribe(uri) {
  var retryTime = 1;

  function connect(uri) {
    const events = new EventSource(uri);

    events.addEventListener("message", (ev) => {
      console.info("raw data", JSON.stringify(ev.data));
      console.info("decoded data", JSON.stringify(JSON.parse(ev.data)));
      const msg = JSON.parse(ev.data);
      if (!"message" in msg || !"room" in msg || !"username" in msg) return;
      addMessage(msg.room, msg.username, msg.message, msg.time, true);
    });

    events.addEventListener("open", () => {
      setConnectedStatus(true);
      console.info(`connected to event stream at ${uri}`);
      retryTime = 1;
    });

    events.addEventListener("error", () => {
      setConnectedStatus(false);
      events.close();

      let timeout = retryTime;
      retryTime = Math.min(64, retryTime * 2);
      console.info(`connection lost. attempting to reconnect in ${timeout}s`);
      setTimeout(() => connect(uri), (() => timeout * 1000)());
    });
  }

  connect(uri);
}

// Set the connection status: `true` for connected, `false` for disconnected.
function setConnectedStatus(status) {
  STATE.connected = status;
  statusDiv.className = status ? "connected" : "reconnecting";
}

function init() {
  addRoom("general");
  addRoom("test");
  changeRoom("general");
  addMessage(
    "general",
    "Server",
    "Welcome to IRCR (Internet Relay Chat Ripoff)! To change your username, click the gear icon, type it out and then press ENTER. It should then be refreshed in the top right corner.",
    "12:00",
    true
  );
  addMessage("test", "Server", "Another room. Neat, huh?", "12:00", true);

  messageField.addEventListener("input", () => {
    if (
      messageField.value.length >=
      parseInt(messageField.getAttribute("maxlength"), 10)
    ) {
      messageField.classList.add("error");
    } else {
      messageField.classList.remove("error");
    }
  });

  // Set up the form handler.
  newMessageForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const room = STATE.room;
    const message = messageField.value;
    const username = usernameField.value || default_username;

    STATE.username = usernameField.value || default_username;
    usernameDisplay.textContent = STATE.username;
    saveState();

    if (!message || !username) return;

    if (STATE.connected) {
      let params = new URLSearchParams({ room, username, message, time });
      console.log(params.toString());
      fetch("/message", {
        method: "POST",
        body: params,
      }).then((response) => {
        if (response.ok) messageField.value = "";
      });
    }
  });

  // Set up the new room handler.
  newRoomForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const room = roomNameField.value;
    if (!room) return;

    roomNameField.value = "";
    if (!addRoom(room)) return;

    addMessage(
      room,
      "Server",
      `A new room has appeared. Everyone, we present you with the "${room}".`,
      time,
      true
    );
  });

  // Subscribe to server-sent events.
  subscribe("/events");
}

const form = document.querySelector("form#new-message");
const message = document.querySelector("textarea#message");

function submitOnEnter(event) {
  if (event.which === 13 && !event.shiftKey) {
    event.target.form.dispatchEvent(new Event("submit", { cancelable: true }));
    event.preventDefault(); // Prevents the addition of a new line in the text field (not needed in a lot of cases)
  }
}

form.addEventListener("keypress", submitOnEnter);

const settingsModal = document.getElementById("settings-modal");

document.getElementById("settings").onclick = function () {
  overlay.classList.add("visible");
  settingsModal.style.display = "block";
};

document.getElementById("settings-close").onclick = function () {
  overlay.classList.remove("visible");
  settingsModal.style.display = "none";
};

document.getElementById("new-room-button").onclick = function () {
  overlay.classList.add("visible");
  document.getElementById("tooltip").style.display = "block";
};

document.getElementById("new-room-form").onsubmit = function () {
  overlay.classList.remove("visible");
  document.getElementById("tooltip").style.display = "none";
};

document.body.addEventListener("keypress", (event) => {
  // if ESC is pressed
  if (event.keyCode === 27) {
    overlay.classList.remove("visible");

    document.getElementById("tooltip").style.display = "none";
    settingsModal.style.display = "none";
  }
});

// document.addEventListener("keydown", () => {
//   const modals = document.getElementsByClassName("modal");
//   let isAnyModalOpen = false;

//   for (let i = 0; i < modals.length; i++) {
//     if (modals[i].style.display === "block") {
//       isAnyModalOpen = true;
//       break;
//     }
//   }

//   if (!isAnyModalOpen) {
//     messageField.focus();
//   }
// });

usernameField.addEventListener("keypress", (event) => {
  if (event.which === 13 && !event.shiftKey) {
    usernameDisplay.textContent = event.target.value;
  }
});

scrollToBottom();
init();
