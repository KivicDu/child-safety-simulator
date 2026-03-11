import struct
import json
import os

files = [
    'Frontend/public/models/dummy.glb'
]

with open(r'e:\child-safety-simulator\rig_analysis.txt', 'w', encoding='utf-8') as out_f:
    for filePath in files:
        filePath = os.path.join(r'e:\child-safety-simulator', filePath)
        out_f.write(f"=== {os.path.basename(filePath)} ===\n")
        try:
            with open(filePath, 'rb') as f:
                magic = f.read(4)
                if magic != b'glTF':
                    out_f.write("Not a valid GLB\n\n")
                    continue
                f.read(8) # skip version and length
                
                chunkLength, chunkType = struct.unpack('<II', f.read(8))
                if chunkType != 0x4E4F534A: # JSON
                    out_f.write("First chunk is not JSON\n\n")
                    continue
                    
                jsonStr = f.read(chunkLength).decode('utf-8')
                data = json.loads(jsonStr)
                
                nodes = data.get('nodes', [])
                names = [n.get('name', 'unnamed') for n in nodes]
                joints = []
                
                skins = data.get('skins', [])
                if skins:
                    for skin in skins:
                        skin_joints = skin.get('joints', [])
                        for j in skin_joints:
                            joints.append(nodes[j].get('name', 'unnamed'))
                    
                    out_f.write(f"Rig found with {len(joints)} joints.\n")
                    out_f.write(f"Sample joints: {joints[:30]}\n")
                else:
                    out_f.write(f"NO SKINS/RIG FOUND. Total nodes: {len(nodes)}\n")
                    out_f.write(f"Sample nodes: {names[:30]}\n")
                
        except Exception as e:
            out_f.write(f"Error reading {filePath}: {e}\n")
        out_f.write("\n")
