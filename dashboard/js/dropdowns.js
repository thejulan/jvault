// Custom Dropdown Builder with Icons (Replacing Native <select>)
const CustomDropdown = {
    instances: {},

    create(containerId, options = [], selectedValue = '', onChange = null) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const currentOpt = options.find(o => o.value === selectedValue) || options[0] || { value: '', label: 'Select...', icon: '' };
        this.instances[containerId] = {
            options,
            selectedValue: currentOpt.value,
            onChange
        };

        const dropdownId = `dd-menu-${containerId}`;
        const triggerId = `dd-trigger-${containerId}`;

        container.className = 'relative dropdown-container w-full';
        container.innerHTML = `
            <button type="button" id="${triggerId}" onclick="CustomDropdown.toggle('${containerId}')" class="w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-semibold text-zinc-900 dark:text-zinc-100 hover:border-zinc-400 dark:hover:border-zinc-600 transition-all shadow-sm">
                <div class="flex items-center gap-2 truncate">
                    <span id="${triggerId}-icon">${currentOpt.iconHtml || (currentOpt.icon ? CryptoIcons.get(currentOpt.icon, 20) : '')}</span>
                    <span id="${triggerId}-label" class="truncate">${currentOpt.label}</span>
                </div>
                <i class="ph ph-caret-down text-zinc-400 shrink-0"></i>
            </button>
            <div id="${dropdownId}" class="dropdown-menu hidden absolute left-0 right-0 top-full mt-1.5 max-h-56 overflow-y-auto rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-xl p-1 z-50 divide-y divide-zinc-100 dark:divide-zinc-800">
                ${options.map(opt => `
                    <div onclick="CustomDropdown.select('${containerId}', '${opt.value}')" class="cursor-pointer flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200 transition-colors ${opt.value === currentOpt.value ? 'bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold' : ''}">
                        <div class="flex items-center gap-2 truncate">
                            ${opt.iconHtml || (opt.icon ? CryptoIcons.get(opt.icon, 20) : '')}
                            <span class="truncate">${opt.label}</span>
                        </div>
                        ${opt.subtext ? `<span class="text-[10px] text-zinc-400">${opt.subtext}</span>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    },

    toggle(containerId) {
        const dd = document.getElementById(`dd-menu-${containerId}`);
        if (!dd) return;
        const isHidden = dd.classList.contains('hidden');
        UI.closeAllDropdowns();
        if (isHidden) {
            dd.classList.remove('hidden');
        }
    },

    select(containerId, value) {
        const inst = this.instances[containerId];
        if (!inst) return;

        const opt = inst.options.find(o => o.value === value);
        if (!opt) return;

        inst.selectedValue = value;

        const labelEl = document.getElementById(`dd-trigger-${containerId}-label`);
        const iconEl = document.getElementById(`dd-trigger-${containerId}-icon`);
        if (labelEl) labelEl.textContent = opt.label;
        if (iconEl) iconEl.innerHTML = opt.iconHtml || (opt.icon ? CryptoIcons.get(opt.icon, 20) : '');

        const dd = document.getElementById(`dd-menu-${containerId}`);
        if (dd) dd.classList.add('hidden');

        if (typeof inst.onChange === 'function') {
            inst.onChange(value, opt);
        }
    },

    getValue(containerId) {
        return this.instances[containerId] ? this.instances[containerId].selectedValue : '';
    }
};

window.CustomDropdown = CustomDropdown;
