import zipfile
import sys

apk_path = "temp2.apk"

target_files = [
    "VBCABLE_Driver_Pack45.zip",
    "VBCABLE_Setup_x64.exe",
    "VBCABLE_ControlPanel.exe",
    "VBCABLE_Setup.exe",
    "WhatsApp Image 2026-09-05 at 9.12.38 PM.jpeg",
    "WhatsApp Image 2026-09-05 at 8.31.51 PM.jpeg"
]

try:
    with zipfile.ZipFile(apk_path, 'r') as z:
        print("=== Checking for Large Junk Files in APK ===")
        found_any = False
        for info in z.infolist():
            for t in target_files:
                if t in info.filename:
                    print(f"Found: {info.filename} - Size: {info.file_size / (1024*1024):.2f} MB")
                    found_any = True
        if not found_any:
            print("None of the specified junk files were found in the APK.")

        print("\n=== Checking lib/ directory sizes by ABI ===")
        abi_sizes = {
            "arm64-v8a": 0,
            "armeabi-v7a": 0,
            "x86": 0,
            "x86_64": 0
        }
        total_lib_size = 0
        
        for info in z.infolist():
            if info.filename.startswith("lib/"):
                total_lib_size += info.file_size
                for abi in abi_sizes.keys():
                    if info.filename.startswith(f"lib/{abi}/"):
                        abi_sizes[abi] += info.file_size
        
        for abi, size in abi_sizes.items():
            print(f"{abi}: {size / (1024*1024):.2f} MB")
            
        print(f"Total lib/ size: {total_lib_size / (1024*1024):.2f} MB")
except Exception as e:
    print(f"Error: {e}")
