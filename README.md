# Math Dash

A dodge game: the Math Dash character stands on a 3-lane floor while math symbols are thrown at it from a glowing portal. Move left and right to dodge, and grab stars for bonus points. Every object you dodge is a point, and they come faster the longer you survive.

## Controls
- **Phone:** swipe left/right, or tap the left/right half of the screen
- **Keyboard:** ← / → (or A / D); Space or Enter to start

## Run it
It is plain HTML/JS with no build step. Serve the folder and open it:

```
python3 -m http.server 8000
# then open http://localhost:8000 (or http://<your-computer-ip>:8000 on your phone)
```

## Phone app
The game is already set up as a Progressive Web App (`manifest.webmanifest`, `sw.js`). Once it is hosted over HTTPS (e.g. GitHub Pages), open it on a phone and choose **Add to Home Screen**. It then launches full-screen with its own icon and works offline.

To ship to the App Store / Google Play later, the same files can be wrapped with [Capacitor](https://capacitorjs.com/):

```
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Math Dash" com.example.mathdash --web-dir .
npx cap add ios && npx cap add android
```

## Files
- `index.html`, `style.css` – page and menus
- `game.js` – game loop, perspective road, obstacles, input, scoring
- The character is drawn in code (`drawPlayer` in `game.js`)
- `assets/icon-*.png` – app icons
