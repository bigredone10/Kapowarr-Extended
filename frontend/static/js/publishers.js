// Publishers - Browse by Publisher

const volumeTemplate = document.querySelector('.pre-build-els .pub-volume-card');
const publisherList = document.querySelector('#publisher-list');
const loadingPublishers = document.querySelector('#loading-publishers');
const emptyPublishers = document.querySelector('#empty-publishers');
const volumesPlaceholder = document.querySelector('#volumes-placeholder');
const volumesContent = document.querySelector('#volumes-content');
const volumesGrid = document.querySelector('#volumes-grid');
const loadingVolumes = document.querySelector('#loading-volumes');
const emptyVolumes = document.querySelector('#empty-volumes');
const publisherName = document.querySelector('#selected-publisher-name');
const publisherFilter = document.querySelector('#publisher-filter');
const searchInput = document.querySelector('#pub-search-input');
const searchForm = document.querySelector('.pub-search-bar');
const searchClear = document.querySelector('#pub-search-clear');

const customPublisherForm = document.querySelector('#custom-publisher-form');
const customPublisherInput = document.querySelector('#custom-publisher-input');

let selectedPublisher = null;

// Pagination state
let currentOffset = 0;
let totalResults = 0;
let pageLimit = 100;
let isLoadingMore = false;
let currentQuery = '';
let loadRequestId = 0;

// Add Volume modal elements
const pubAddEls = {
	cover: document.querySelector('#pub-add-cover'),
	form: document.querySelector('#pub-add-form'),
	title: document.querySelector('#pub-add-window .window-header h2'),
	cv_input: document.querySelector('#pub-comicvine-input'),
	root_folder_input: document.querySelector('#pub-rootfolder-input'),
	volume_folder_input: document.querySelector('#pub-volumefolder-input'),
	monitor_volume_input: document.querySelector('#pub-monitor-volume-input'),
	monitor_issues_input: document.querySelector('#pub-monitor-issues-input'),
	monitoring_scheme: document.querySelector('#pub-monitoring-scheme-input'),
	special_state_input: document.querySelector('#pub-specialoverride-input'),
	auto_search_input: document.querySelector('#pub-auto-search-input'),
	submit: document.querySelector('#pub-add-volume')
};

let generatedFolderName = '';

function fillRootFolders(api_key) {
	fetchAPI('/rootfolder', api_key)
	.then(json => {
		json.result.forEach(folder => {
			const option = document.createElement('option');
			option.value = folder.id;
			option.innerText = folder.folder;
			pubAddEls.root_folder_input.appendChild(option);
		});
	});
};

// Publisher list
function loadPublishers() {
	usingApiKey()
	.then(api_key => fetchAPI('/publishers', api_key))
	.then(json => {
		const publishers = json.result;
		if (publishers.length === 0) {
			hide([loadingPublishers], [emptyPublishers]);
			return;
		}

		publisherList.innerHTML = '';
		publishers.forEach(pub => {
			const li = document.createElement('li');
			li.dataset.publisher = pub.publisher;

			const name = document.createElement('span');
			name.className = 'pub-name';
			name.textContent = pub.publisher;

			const count = document.createElement('span');
			count.className = 'pub-count';
			count.textContent = pub.volume_count;

			li.appendChild(name);
			li.appendChild(count);

			li.onclick = () => selectPublisher(pub.publisher);
			publisherList.appendChild(li);
		});

		hide([loadingPublishers], [publisherList]);
	})
	.catch(e => {
		console.error('Failed to load publishers:', e);
		hide([loadingPublishers], [emptyPublishers]);
	});
};

function filterPublishers() {
	const filter = publisherFilter.value.toLowerCase();
	publisherList.querySelectorAll('li').forEach(li => {
		const name = li.dataset.publisher.toLowerCase();
		if (name.includes(filter)) {
			li.classList.remove('hidden');
		} else {
			li.classList.add('hidden');
		}
	});
};

publisherFilter.oninput = filterPublishers;

// Volume browsing
function selectPublisher(publisher) {
	selectedPublisher = publisher;
	publisherName.textContent = publisher;
	searchInput.value = '';
	currentQuery = '';

	// Highlight active publisher
	publisherList.querySelectorAll('li').forEach(li => {
		if (li.dataset.publisher === publisher) {
			li.classList.add('active');
		} else {
			li.classList.remove('active');
		}
	});

	hide([volumesPlaceholder], [volumesContent]);
	loadVolumes(publisher, '', true);
};

function loadVolumes(publisher, query, reset) {
	if (reset) {
		currentOffset = 0;
		totalResults = 0;
		currentQuery = query;
		volumesGrid.innerHTML = '';
		hide([emptyVolumes], [loadingVolumes]);
		loadRequestId++;
	}

	isLoadingMore = true;
	const thisRequest = loadRequestId;

	const params = {
		publisher: publisher,
		offset: currentOffset,
		limit: pageLimit
	};
	if (query) params.query = query;

	usingApiKey()
	.then(api_key => fetchAPI('/publishers/volumes', api_key, params))
	.then(json => {
		// Discard if a newer request has been made
		if (thisRequest !== loadRequestId) return;

		const data = json.result;
		totalResults = data.total;
		appendVolumes(data.volumes);
		currentOffset += pageLimit;

		if (data.volumes.length === 0 && currentOffset <= pageLimit) {
			hide([loadingVolumes], [emptyVolumes]);
		} else {
			hide([loadingVolumes, emptyVolumes], [volumesGrid]);
		}
	})
	.catch(e => {
		if (thisRequest !== loadRequestId) return;
		console.error('Failed to load volumes:', e);
		if (currentOffset === 0) {
			hide([loadingVolumes], [emptyVolumes]);
		}
	})
	.finally(() => {
		if (thisRequest === loadRequestId) {
			isLoadingMore = false;
		}
	});
};

function appendVolumes(volumes) {
	// Remove existing spacers
	volumesGrid.querySelectorAll('.pub-grid-spacer').forEach(s => s.remove());

	const api_key = getLocalStorage('api_key').api_key;

	volumes.forEach(vol => {
		const card = volumeTemplate.cloneNode(true);

		if (vol.in_library && vol.id) {
			card.href = `${url_base}/volumes/${vol.id}`;
			card.classList.add('in-library');
		} else {
			card.href = '#';
			card.classList.add('not-in-library');
			card.onclick = e => {
				e.preventDefault();
				showAddVolumeWindow(
					vol.comicvine_id,
					vol.title,
					vol.cover_link || ''
				);
			};
		}

		card.setAttribute('aria-label', vol.title);

		const cover = card.querySelector('.pub-volume-cover');
		if (vol.in_library && vol.id) {
			cover.src = `${url_base}/api/volumes/${vol.id}/cover?api_key=${api_key}`;
		} else if (vol.cover_link) {
			cover.src = vol.cover_link;
		}
		cover.alt = vol.title;

		card.querySelector('.pub-volume-title').textContent = vol.title;

		const yearText = vol.year ? `(${vol.year})` : '';
		card.querySelector('.pub-volume-year').textContent = yearText;

		if (vol.issue_count !== undefined) {
			card.querySelector('.pub-volume-issues').textContent =
				`${vol.issue_count} issues`;
		}

		const badge = card.querySelector('.pub-volume-badge');
		if (vol.in_library) {
			badge.textContent = 'In Library';
			badge.classList.add('badge-library');
		} else {
			badge.textContent = 'Add';
			badge.classList.add('badge-add');
		}

		volumesGrid.appendChild(card);
	});

	// Add spacers to prevent last row from stretching
	for (let i = 0; i < 20; i++) {
		const spacer = document.createElement('div');
		spacer.className = 'pub-grid-spacer';
		volumesGrid.appendChild(spacer);
	}

	// Update status
	const cardCount = volumesGrid.querySelectorAll('.pub-volume-card').length;
	if (totalResults > 0) {
		publisherName.textContent =
			`${selectedPublisher} (${cardCount} of ${totalResults})`;
	}
};

// Infinite scroll - load more when near bottom
volumesGrid.addEventListener('scroll', () => {
	if (isLoadingMore || !selectedPublisher) return;
	if (currentOffset >= totalResults) return;

	const scrollBottom = volumesGrid.scrollHeight - volumesGrid.scrollTop - volumesGrid.clientHeight;
	if (scrollBottom < 300) {
		loadVolumes(selectedPublisher, currentQuery, false);
	}
});

// Search within publisher
searchForm.onsubmit = e => {
	e.preventDefault();
	if (selectedPublisher) {
		loadVolumes(selectedPublisher, searchInput.value, true);
	}
};

searchClear.onclick = () => {
	searchInput.value = '';
	if (selectedPublisher) {
		loadVolumes(selectedPublisher, '', true);
	}
};

// Add Volume modal
function showAddVolumeWindow(cvId, title, coverUrl) {
	pubAddEls.title.innerText = `Add: ${title}`;
	pubAddEls.cover.src = coverUrl || '';
	pubAddEls.cv_input.value = cvId;
	pubAddEls.special_state_input.value = 'auto';
	pubAddEls.submit.innerText = 'Add Volume';

	const prefs = getLocalStorage(
		'monitor_new_volume', 'monitor_new_issues', 'monitoring_scheme'
	);
	pubAddEls.monitor_volume_input.value = prefs.monitor_new_volume;
	pubAddEls.monitor_issues_input.value = prefs.monitor_new_issues;
	pubAddEls.monitoring_scheme.value = prefs.monitoring_scheme;

	// Disable submit until folder name is generated
	pubAddEls.submit.disabled = true;
	pubAddEls.submit.innerText = 'Loading...';

	usingApiKey()
	.then(api_key =>
		fetchAPI('/volumes/search', api_key, { query: `cv:${cvId}` })
	)
	.then(json => {
		if (json.result.length > 0) {
			const vol = json.result[0];
			return usingApiKey().then(api_key =>
				sendAPI('POST', '/volumes/search', api_key, {}, {
					comicvine_id: cvId,
					title: vol.title,
					year: vol.year,
					volume_number: vol.volume_number || 1,
					publisher: vol.publisher
				})
			);
		}
	})
	.then(response => {
		if (response) return response.json();
	})
	.then(json => {
		if (json) {
			generatedFolderName = json.result.folder;
			pubAddEls.volume_folder_input.value = generatedFolderName;
		}
	})
	.finally(() => {
		pubAddEls.submit.disabled = false;
		pubAddEls.submit.innerText = 'Add Volume';
	});

	showWindow('pub-add-window');
};

function addVolumeFromPublisher() {
	showLoadWindow('pub-add-window');

	const volumeFolder = pubAddEls.volume_folder_input.value;
	const data = {
		comicvine_id: parseInt(pubAddEls.cv_input.value),
		root_folder_id: parseInt(pubAddEls.root_folder_input.value),
		monitor: pubAddEls.monitor_volume_input.value === 'true',
		monitoring_scheme: pubAddEls.monitoring_scheme.value,
		monitor_new_issues: pubAddEls.monitor_issues_input.value === 'true',
		volume_folder: '',
		special_version: pubAddEls.special_state_input.value || null,
		auto_search: pubAddEls.auto_search_input.checked
	};

	if (volumeFolder !== '' && volumeFolder !== generatedFolderName) {
		data.volume_folder = volumeFolder;
	}

	setLocalStorage({
		monitor_new_volume: data.monitor,
		monitor_new_issues: data.monitor_new_issues,
		monitoring_scheme: data.monitoring_scheme
	});

	usingApiKey()
	.then(api_key =>
		sendAPI('POST', '/volumes', api_key, {}, data)
	)
	.then(response => response.json())
	.then(json => {
		closeWindow();
		// Refresh both panels
		loadPublishers();
		if (selectedPublisher) {
			loadVolumes(selectedPublisher, searchInput.value, true);
		}
	})
	.catch(e => {
		if (e.status === 509) {
			pubAddEls.submit.innerText = 'ComicVine API rate limit reached';
			showWindow('pub-add-window');
		} else if (e.status === 400) {
			pubAddEls.submit.innerText = 'Volume folder is parent or child of other volume folder';
			showWindow('pub-add-window');
		} else {
			console.error('Failed to add volume:', e);
			closeWindow();
		}
	});
};

pubAddEls.form.action = 'javascript:addVolumeFromPublisher();';

// Custom publisher browsing
customPublisherForm.onsubmit = e => {
	e.preventDefault();
	const name = customPublisherInput.value.trim();
	if (name) {
		selectPublisher(name);
		customPublisherInput.value = '';
	}
};

// Initial load
usingApiKey().then(api_key => fillRootFolders(api_key));
loadPublishers();
