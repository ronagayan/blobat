# Training Grounds

A standalone single-player batting cage game. No server, no setup — just open `index.html` in any modern browser.

## How to Run

Open `index.html` directly in Chrome, Firefox, Edge, or Safari. No build step, no npm, no server required.

## Controls

| Input | Action |
|---|---|
| WASD / Arrow Keys | Move |
| Mouse | Aim bat direction |
| Swing mouse toward ball | Hit the ball |
| Space | Roll (dodge) |
| Click +ENEMY button | Spawn an AI enemy (max 5) |
| Click ↺ RESTART | Reset the game |

## Mechanics

- **Hit the ball** into enemies to damage them — harder hits deal more damage
- **Enemies** will chase the ball and try to swing it back at you
- **Dodge** fast-moving balls (they deal damage proportional to speed)
- The **momentum bar** shows current ball speed as a percentage of max speed
- You lose when your **HP reaches 0** — click RESTART to try again

## Features

- Claymorphism visuals with radial gradients and drop shadows
- Physics ball with squash/stretch, motion trail, and wall bouncing
- AI enemies with bat swing, chase, and dodge behaviors
- Floating damage numbers on hit
- Off-screen ball and enemy indicators on canvas edges
- Momentum bar HUD
