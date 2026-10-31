import json
import sys
from pathlib import Path


path = Path(sys.argv[1])
document = json.loads(path.read_text(encoding="utf-8"))
versions = {"msgpack": "1.2.1", "urllib3": "2.8.0"}
references = {}
found = set()

for component in document.get("components", []):
    name = component.get("name", "").lower()
    if name not in versions:
        continue
    old = component.get("bom-ref") or component.get("purl")
    version = versions[name]
    reference = f"pkg:pypi/{name}@{version}"
    found.add(name)
    if old:
        references[old] = reference
    component.update({"bom-ref": reference, "purl": reference, "version": version})

if found != set(versions):
    raise ValueError("The pip vendored SBOM did not contain both patched components.")

for dependency in document.get("dependencies", []):
    dependency["ref"] = references.get(dependency.get("ref"), dependency.get("ref"))
    dependency["dependsOn"] = [references.get(value, value) for value in dependency.get("dependsOn", [])]

path.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
