import json

with open('stims/stims_new.json') as f:
    data = json.load(f)

with open('experiments/main/js/stimuli.js', 'w') as f:
    f.write('var stimuli = ')
    json.dump(data, f, indent=2)
    f.write(';\n')
