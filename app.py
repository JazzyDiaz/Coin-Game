import os
from flask import Flask, render_template, jsonify, url_for

app = Flask(__name__)

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}
AUDIO_EXTENSIONS = {'.mp3', '.ogg', '.wav', '.m4a'}


def natural_key(name):
    """Sort '2.jpg' before '10.jpg' instead of alphabetically."""
    import re
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', name)]


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/bomb-media')
def bomb_media():
    """Looks in static/images/bomb and static/audio and reports back
    whatever the user has actually dropped in there. Nothing is hardcoded,
    so adding or swapping files never requires touching the code."""
    img_dir = os.path.join(app.static_folder, 'images', 'bomb')
    audio_dir = os.path.join(app.static_folder, 'audio')

    images = []
    if os.path.isdir(img_dir):
        files = [f for f in os.listdir(img_dir)
                 if os.path.splitext(f)[1].lower() in IMAGE_EXTENSIONS]
        for f in sorted(files, key=natural_key):
            images.append(url_for('static', filename=f'images/bomb/{f}'))

    audio = None
    if os.path.isdir(audio_dir):
        files = [f for f in os.listdir(audio_dir)
                 if os.path.splitext(f)[1].lower() in AUDIO_EXTENSIONS]
        for f in sorted(files, key=natural_key):
            audio = url_for('static', filename=f'audio/{f}')
            break  # first audio file found is "the song"

    return jsonify({'images': images, 'audio': audio})


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)