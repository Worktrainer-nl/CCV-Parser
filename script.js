let globalProductTelling = {};
let globalCountrySet = new Set();
let originalXMLContent; // Globale variabele om de originele XML data op te slaan

// Statussen die standaard aangevinkt worden als ze in het bestand voorkomen.
// Bevat zowel Nederlandse als Duitse varianten zodat exports in beide talen werken.
const DEFAULT_INCLUDED_STATUSES = [
    // Afgerond / Completed
    "Afgerond", "Erledigt",
    // Wachten op betaling / Waiting for payment
    "Wachten op betaling", "Wachten op betaling (Producten zijn toegestuurd)", "Warten auf Zahlung",
    // Wachten op fabrikant / Waiting for manufacturer
    "Wachten op fabrikant", "Warten auf Hersteller",
    // In behandeling / In progress
    "In behandeling", "In Bearbeitung",
    // Gefactureerd via Exact / Invoiced
    "gefactureerd via Exact"
];

// De statussen die de gebruiker heeft aangevinkt om mee te tellen.
let selectedStatuses = new Set();

function uploadFile() {
    const fileInput = document.getElementById('fileUploader');
    if (!fileInput.files.length) {
        alert('Selecteer eerst een bestand.');
        return;
    }

    const file = fileInput.files[0];
    if (file.type !== "text/xml" && file.type !== "application/xml" && !file.type) {
        alert('Het bestand moet een XML-bestand zijn.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        originalXMLContent = e.target.result; // Sla de originele XML data op
        initStatusFilter(originalXMLContent); // Bouw de statusfilter op basis van dit bestand
        verwerkXML(originalXMLContent);
    };
    reader.readAsText(file);
}

// Verzamel alle statussen die in het bestand voorkomen en bouw de checkboxes.
// Standaard worden de bekende "telbare" statussen aangevinkt.
function initStatusFilter(content) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(content, "text/xml");

    const allStatuses = new Set();
    const orders = xmlDoc.getElementsByTagName("order");
    for (let order of orders) {
        const status = getTextContent(order, 'statusname');
        if (status) allStatuses.add(status);
    }

    const statusList = [...allStatuses].sort((a, b) => a.localeCompare(b));
    // Vink standaard de bekende statussen aan die daadwerkelijk voorkomen
    selectedStatuses = new Set(statusList.filter(s => DEFAULT_INCLUDED_STATUSES.includes(s)));

    buildStatusFilter(statusList);
}

function buildStatusFilter(statusList) {
    const container = document.getElementById("statusFilter");
    container.innerHTML = '';

    if (!statusList.length) {
        container.style.display = 'none';
        return;
    }

    const title = document.createElement('div');
    title.className = 'status-filter-title';
    title.textContent = 'Statussen meenemen in de telling:';
    container.appendChild(title);

    const options = document.createElement('div');
    options.className = 'status-filter-options';

    statusList.forEach(status => {
        const item = document.createElement('label');
        item.className = 'status-filter-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = status;
        checkbox.checked = selectedStatuses.has(status);
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                selectedStatuses.add(status);
            } else {
                selectedStatuses.delete(status);
            }
            verwerkXML(originalXMLContent);
        });

        item.appendChild(checkbox);
        item.appendChild(document.createTextNode(' ' + status));
        options.appendChild(item);
    });

    container.appendChild(options);
    container.style.display = 'block';
}

function verwerkXML(content) {
    if (!content) return; // Nog geen bestand geüpload
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(content, "text/xml");
    const productTelling = {};
    const statusNames = new Set();
	const includeBusinesses = document.getElementById('includeBusinesses').checked;

    const orders = xmlDoc.getElementsByTagName("order");
    for (let order of orders) {
        const vatContent = getTextContent(order, 'vat');
        // Controleer of er een waarde in <vat> staat, zo ja, sla deze order over
        //if (vatContent.trim() !== '') continue;
		if (vatContent.trim() !== '' && !includeBusinesses) continue;

        const status = getTextContent(order, 'statusname');

		// Alleen de door de gebruiker aangevinkte statussen meetellen
		if (!selectedStatuses.has(status)) continue;

        statusNames.add(status);

        let country = getTextContent(order, 'delivercountry');
        if (!country) {
            country = getTextContent(order, 'country');
        }
        if (country) {
            globalCountrySet.add(country);
        }

        const orderRows = order.getElementsByTagName("orderrow");
        for (let row of orderRows) {
            const prodName = getTextContent(row, "rowprodname");
            const count = parseInt(getTextContent(row, "count"));
            if (count > 0) {
                incrementProductCount(productTelling, prodName, count, status, country);

                const attributes = row.getElementsByTagName("attribute");
                for (let attr of attributes) {
                    const price = parseFloat(getTextContent(attr, "price"));
                    if (price > 0) {
                        const optionName = getTextContent(attr, "optionname");
                        // Combineer optionname en valuename voor een complete beschrijving
                        const valueName = getTextContent(attr, "valuename");
                        const combinedName = `${optionName} ${valueName}`;
                        incrementProductCount(productTelling, combinedName, 1, status, country);
                    }
                }
            }
        }
    }

    globalProductTelling = productTelling;
    updateStatusDropdown([...statusNames]);
    updateCountryDropdown([...globalCountrySet]);
    displayResults(globalProductTelling, "", "");
}

function getTextContent(parentElement, tagName) {
    const element = parentElement.getElementsByTagName(tagName)[0];
    return element ? element.textContent.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
}

function incrementProductCount(productTelling, prodName, count, status, country) {
    if (!productTelling[prodName]) {
        productTelling[prodName] = { count: 0, statuses: {}, countries: {} };
    }

    // Voeg de count toe aan de totale count
    productTelling[prodName].count += count;

    // Voeg de count toe aan de specifieke status
    if (status) {
        productTelling[prodName].statuses[status] = (productTelling[prodName].statuses[status] || 0) + count;
    }

    // Voeg de count toe aan het specifieke land
    if (country) {
        productTelling[prodName].countries[country] = (productTelling[prodName].countries[country] || 0) + count;
    }
}

function updateStatusDropdown(statusNames) {
    const dropdown = document.getElementById("statusDropdown");
    dropdown.innerHTML = '<option value="">Alle Statussen</option>';
    statusNames.forEach(status => {
        const option = document.createElement("option");
        option.value = status;
        option.textContent = status;
        dropdown.appendChild(option);
    });
    dropdown.style.display = 'block';
}

function updateCountryDropdown(countries) {
    const dropdown = document.getElementById("countryDropdown");
    dropdown.innerHTML = '<option value="">Alle Landen</option>';
    countries.forEach(country => {
        const option = document.createElement("option");
        option.value = country;
        option.textContent = country;
        dropdown.appendChild(option);
    });
    dropdown.style.display = 'block';
}

function displayResults(productTelling, selectedStatus = "", selectedCountry = "") {
    const resultatenDiv = document.getElementById("resultaten");
    resultatenDiv.innerHTML = '';

    // Filter products based on selected country and status
    let displayProducts = Object.entries(productTelling).filter(([prodName, productInfo]) => {
        const countryMatch = selectedCountry === "" || productInfo.countries[selectedCountry] !== undefined;
        const statusMatch = selectedStatus === "" || productInfo.statuses[selectedStatus] !== undefined;
        return countryMatch && statusMatch;
    }).map(([prodName, productInfo]) => {
        // Determine count to display based on selection
        let displayCount = selectedStatus === "" 
            ? productInfo.count // If no status selected, use the total count
            : productInfo.statuses[selectedStatus] || 0; // Otherwise, use the count for the selected status

        if (selectedCountry !== "") {
            // If a country is selected, only count that country's total for the product
            displayCount = productInfo.countries[selectedCountry] || 0;
        }

        return [prodName, displayCount];
    });

    // Sort products by count in descending order
    displayProducts.sort((a, b) => b[1] - a[1]);

    // Create elements for display
    displayProducts.forEach(([prodName, count]) => {
        if (count > 0) {
            const resultRow = document.createElement("div");
            resultRow.className = 'result-row';
            const amountDiv = document.createElement("div");
            amountDiv.className = 'amount';
            amountDiv.textContent = count;
            const productDiv = document.createElement("div");
            productDiv.className = 'product';
            productDiv.textContent = prodName;
            resultRow.appendChild(amountDiv);
            resultRow.appendChild(productDiv);
            resultatenDiv.appendChild(resultRow);
        }
    });
}

document.getElementById("statusDropdown").onchange = function() {
    displayResults(globalProductTelling, this.value, document.getElementById("countryDropdown").value);
};

document.getElementById("countryDropdown").onchange = function() {
    displayResults(globalProductTelling, document.getElementById("statusDropdown").value, this.value);
};

document.getElementById('includeBusinesses').addEventListener('change', function() {
    // Verwerk de XML data opnieuw met de huidige staat van de checkbox
    verwerkXML(originalXMLContent);
});