"""Approved narrow-edge matting. No network, model, erosion or temporal averaging."""
import argparse
import json
import subprocess as sp

import numpy as np
from PIL import Image, ImageFilter

METHOD = 'narrow-aa-despill-v2'


def refine_frame(source, baseline):
    """Match the approved QA: 4x bilinear coverage, 1px boundary band."""
    h, w = source.shape[:2]
    # The intermediate codec is a mask source only. Never inherit its RGB:
    # its YUV roundtrip and missing matrix tags can shift opaque skin/clothing.
    rgb = source.copy()
    alpha = baseline[:, :, 3]
    lo = np.asarray(Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)))
    hi = np.asarray(Image.fromarray(alpha).filter(ImageFilter.MaxFilter(3)))
    edge = hi != lo
    high = np.asarray(Image.fromarray(source).resize((w*4, h*4), Image.Resampling.BILINEAR)).astype(np.float32)
    dominance = high[:, :, 1] - np.maximum(high[:, :, 0], high[:, :, 2])
    high_alpha = (255 - np.clip((dominance - 6)*24, 0, 255)).astype(np.uint8)
    coverage = np.asarray(Image.fromarray(high_alpha).resize((w, h), Image.Resampling.BOX))
    new_alpha = np.where(edge, coverage, alpha)
    corrected = source.copy()
    corrected[:, :, 1] = np.minimum(corrected[:, :, 1], np.maximum(corrected[:, :, 0], corrected[:, :, 2]))
    rgb = np.where(edge[:, :, None], corrected, rgb)
    return np.dstack((rgb, new_alpha)).astype(np.uint8)


def read_frame(pipe, size):
    data = bytearray()
    while len(data) < size:
        part = pipe.read(size-len(data))
        if not part:
            if data:
                raise RuntimeError('Incomplete decoded frame')
            return None
        data.extend(part)
    return data


def render(source, baseline, output):
    info = json.loads(sp.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate', '-of', 'json', source]))['streams'][0]
    w, h = info['width'], info['height']
    fps = info['r_frame_rate']
    if fps != info['avg_frame_rate'] or fps == '0/0':
        raise RuntimeError('Narrow matting requires existing constant frame rate; refusing time conversion')
    commands = [
        ['ffmpeg','-v','error','-i',source,'-f','rawvideo','-pix_fmt','rgb24','-'],
        ['ffmpeg','-v','error','-c:v','libvpx-vp9','-i',baseline,'-f','rawvideo','-pix_fmt','rgba','-'],
        ['ffmpeg','-v','error','-n','-f','rawvideo','-pix_fmt','rgba','-s',f'{w}x{h}',
         '-r',fps,'-i','-','-an','-c:v','libvpx-vp9','-lossless','1',
         '-vf','scale=out_color_matrix=bt709:out_range=tv',
         '-auto-alt-ref','0','-pix_fmt','yuva420p',
         '-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',
         '-color_range','tv',output],
    ]
    processes = []
    frames = 0
    try:
        a = sp.Popen(commands[0], stdout=sp.PIPE); processes.append(a)
        b = sp.Popen(commands[1], stdout=sp.PIPE); processes.append(b)
        encoder = sp.Popen(commands[2], stdin=sp.PIPE); processes.append(encoder)
        while True:
            x, y = read_frame(a.stdout, w*h*3), read_frame(b.stdout, w*h*4)
            if x is None or y is None:
                if x is not None or y is not None:
                    raise RuntimeError('Source/baseline frame count mismatch')
                break
            rgba = refine_frame(np.frombuffer(x,np.uint8).reshape(h,w,3), np.frombuffer(y,np.uint8).reshape(h,w,4))
            encoder.stdin.write(rgba.tobytes())
            frames += 1
        encoder.stdin.close()
        for p in processes:
            if p.wait() != 0:
                raise RuntimeError('Matting codec process failed')
        if not frames:
            raise RuntimeError('Empty matting input')
    finally:
        for p in processes:
            if p.poll() is None:
                p.kill()
            p.wait()
    print(json.dumps({'method':METHOD,'frames':frames,'width':w,'height':h,'fps':fps,
        'samplingScale':4,'edgeBandPixels':1,'temporalAveraging':False,
        'opaqueRgbSource':'original-decoded-rgb','colorSpace':'bt709','colorRange':'tv'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for key in ['source','baseline','output']:
        parser.add_argument('--'+key,required=True)
    args = parser.parse_args()
    render(args.source,args.baseline,args.output)
