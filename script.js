document.addEventListener('DOMContentLoaded', function() {
    // Initialize data stores
    let employees = JSON.parse(localStorage.getItem('employees')) || [];
    let attendanceRecords = JSON.parse(localStorage.getItem('attendance')) || {};
    let paymentRecords = JSON.parse(localStorage.getItem('payments')) || [];
    let systemSettings = JSON.parse(localStorage.getItem('settings')) || { 
        currency: 'LKR',
        passcode: '1234', // Default passcode
        theme: 'light'
    };
    
    // Track current action requiring passcode
    let currentPasscodeAction = null;
    let passcodeActionData = null;
    
    // Set today's date in date fields
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('attendanceDate').value = today;
    document.getElementById('paymentDate').value = today;
    document.getElementById('filterPaymentDate').value = today;
    document.getElementById('reportFromDate').value = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];
    document.getElementById('reportToDate').value = today;
    
    // Apply saved settings
    document.getElementById('systemCurrency').value = systemSettings.currency;
    document.getElementById('systemPasscode').value = '';
    document.getElementById('confirmPasscode').value = '';
    
    // Apply theme
    if (systemSettings.theme === 'dark') {
        document.body.classList.add('dark-theme');
        document.getElementById('darkTheme').checked = true;
    } else {
        document.body.classList.remove('dark-theme');
        document.getElementById('lightTheme').checked = true;
    }
    
    updateCurrencySymbols();
    updateDashboard();
    
    // Lock attendance date by default
    document.getElementById('attendanceDate').readOnly = true;
    
    // Theme switcher
    document.querySelectorAll('input[name="theme"]').forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'dark') {
                document.body.classList.add('dark-theme');
                systemSettings.theme = 'dark';
            } else {
                document.body.classList.remove('dark-theme');
                systemSettings.theme = 'light';
            }
            localStorage.setItem('settings', JSON.stringify(systemSettings));
        });
    });
    
    // Initialize tabs
    const tabEls = document.querySelectorAll('button[data-bs-toggle="tab"]');
    tabEls.forEach(tabEl => {
        tabEl.addEventListener('shown.bs.tab', function(event) {
            if (event.target.id === 'attendance-tab') {
                loadAttendanceTable();
            } else if (event.target.id === 'salary-tab') {
                loadPaymentTable();
                loadPaymentHistory();
            } else if (event.target.id === 'employees-tab') {
                loadEmployeeTable();
            } else if (event.target.id === 'report-tab') {
                loadReportEmployeeOptions();
            }
        });
    });
    
    // Load initial data for the active tab (Attendance)
    loadAttendanceTable();
    loadPaymentTable();
    loadEmployeeTable();
    
    // Attendance functionality
    document.getElementById('saveAttendance').addEventListener('click', saveAttendance);
    document.getElementById('changeDateBtn').addEventListener('click', () => requestPasscode('changeDate'));
    document.getElementById('editAttendanceBtn').addEventListener('click', () => requestPasscode('editAttendance'));
    
    // Payment functionality
    document.getElementById('savePayments').addEventListener('click', savePayments);
    document.getElementById('filterPaymentDate').addEventListener('change', loadPaymentHistory);
    
    // Employee functionality
    document.getElementById('employeeForm').addEventListener('submit', saveEmployee);
    document.getElementById('clearEmployeeForm').addEventListener('click', clearEmployeeForm);
    
    // Settings functionality
    document.getElementById('savePasscode').addEventListener('click', savePasscode);
    document.getElementById('saveCurrency').addEventListener('click', saveCurrency);
    document.getElementById('createBackup').addEventListener('click', createBackup);
    document.getElementById('restoreBackup').addEventListener('click', () => requestPasscode('restoreBackup'));
    
    // Payment modal functionality
    document.getElementById('updatePayment').addEventListener('click', updatePaymentRecord);
    document.getElementById('deletePayment').addEventListener('click', () => requestPasscode('deletePayment'));
    
    // Report functionality
    document.getElementById('generateReport').addEventListener('click', generateReport);
    document.getElementById('exportReport').addEventListener('click', exportReportToCSV);
    
    // Passcode modal functionality
    document.getElementById('verifyPasscode').addEventListener('click', verifyPasscode);
    document.getElementById('inputPasscode').addEventListener('input', function() {
        this.value = this.value.replace(/[^0-9]/g, '');
    });
    
    // Functions
    function loadAttendanceTable() {
        const date = document.getElementById('attendanceDate').value;
        const tableBody = document.querySelector('#attendanceTable tbody');
        tableBody.innerHTML = '';
        
        // Get active employees
        const activeEmployees = employees.filter(emp => emp.active);
        
        if (activeEmployees.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="3" class="text-center">No active employees found</td></tr>';
            return;
        }
        
        // Get attendance for the selected date
        const dateKey = formatDateKey(date);
        const dailyAttendance = attendanceRecords[dateKey] || {};
        
        activeEmployees.forEach(employee => {
            const row = document.createElement('tr');
            const status = dailyAttendance[employee.id] || 'present'; // Default to present
            
            row.innerHTML = `
                <td>${employee.id}</td>
                <td>${employee.name}</td>
                <td>
                    <div class="btn-group btn-group-sm" role="group">
                        <input type="radio" class="btn-check" name="status_${employee.id}" id="present_${employee.id}" value="present" ${status === 'present' ? 'checked' : ''} ${isAttendanceLocked(dateKey) ? 'disabled' : ''}>
                        <label class="btn btn-outline-success" for="present_${employee.id}">Present</label>
                        
                        <input type="radio" class="btn-check" name="status_${employee.id}" id="halfday_${employee.id}" value="halfday" ${status === 'halfday' ? 'checked' : ''} ${isAttendanceLocked(dateKey) ? 'disabled' : ''}>
                        <label class="btn btn-outline-warning" for="halfday_${employee.id}">Half Day</label>
                        
                        <input type="radio" class="btn-check" name="status_${employee.id}" id="absent_${employee.id}" value="absent" ${status === 'absent' ? 'checked' : ''} ${isAttendanceLocked(dateKey) ? 'disabled' : ''}>
                        <label class="btn btn-outline-danger" for="absent_${employee.id}">Absent</label>
                    </div>
                </td>
            `;
            
            tableBody.appendChild(row);
        });
        
        // Disable save button if attendance is locked
        if (isAttendanceLocked(dateKey)) {
            document.getElementById('saveAttendance').disabled = true;
            document.getElementById('editAttendanceBtn').classList.remove('btn-outline-warning');
            document.getElementById('editAttendanceBtn').classList.add('btn-outline-secondary');
        } else {
            document.getElementById('saveAttendance').disabled = false;
            document.getElementById('editAttendanceBtn').classList.add('btn-outline-warning');
            document.getElementById('editAttendanceBtn').classList.remove('btn-outline-secondary');
        }
        
        updateDashboard();
    }
    
    function isAttendanceLocked(dateKey) {
        return attendanceRecords[dateKey]?.locked || false;
    }
    
    function saveAttendance() {
        const date = document.getElementById('attendanceDate').value;
        const dateKey = formatDateKey(date);
        const activeEmployees = employees.filter(emp => emp.active);
        
        if (!attendanceRecords[dateKey]) {
            attendanceRecords[dateKey] = {};
        }
        
        activeEmployees.forEach(employee => {
            const status = document.querySelector(`input[name="status_${employee.id}"]:checked`).value;
            attendanceRecords[dateKey][employee.id] = status;
        });
        
        // Lock the attendance after saving
        attendanceRecords[dateKey].locked = true;
        
        localStorage.setItem('attendance', JSON.stringify(attendanceRecords));
        showAlert('success', 'Attendance saved and locked successfully!');
        loadAttendanceTable();
        updateDashboard();
    }
    
    function editAttendance() {
        const date = document.getElementById('attendanceDate').value;
        const dateKey = formatDateKey(date);
        
        if (attendanceRecords[dateKey]) {
            delete attendanceRecords[dateKey].locked;
            localStorage.setItem('attendance', JSON.stringify(attendanceRecords));
            showAlert('success', 'Attendance unlocked for editing!');
            loadAttendanceTable();
        }
    }
    
    function loadPaymentTable() {
        const tableBody = document.querySelector('#paymentTable tbody');
        tableBody.innerHTML = '';
        
        const activeEmployees = employees.filter(emp => emp.active);
        
        if (activeEmployees.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center">No active employees found</td></tr>';
            return;
        }
        
        activeEmployees.forEach(employee => {
            const row = document.createElement('tr');
            const balance = calculateEmployeeBalance(employee.id);
            
            row.innerHTML = `
                <td>${employee.name}</td>
                <td>${formatCurrency(balance)}</td>
                <td><input type="number" class="form-control receipt-input" data-employee="${employee.id}" min="0" step="0.01" placeholder="0.00"></td>
                <td><input type="number" class="form-control payment-input" data-employee="${employee.id}" min="0" step="0.01" placeholder="0.00"></td>
                <td class="new-balance" data-employee="${employee.id}">${formatCurrency(balance)}</td>
            `;
            
            tableBody.appendChild(row);
        });
        
        // Add event listeners to input fields
        document.querySelectorAll('.receipt-input, .payment-input').forEach(input => {
            input.addEventListener('input', function() {
                updateNewBalance(this);
            });
        });
    }
    
    function updateNewBalance(inputElement) {
        const employeeId = inputElement.getAttribute('data-employee');
        const employee = employees.find(emp => emp.id === employeeId);
        if (!employee) return;
        
        const currentBalance = calculateEmployeeBalance(employeeId);
        const receiptInput = document.querySelector(`.receipt-input[data-employee="${employeeId}"]`);
        const paymentInput = document.querySelector(`.payment-input[data-employee="${employeeId}"]`);
        
        const receiptAmount = parseFloat(receiptInput.value) || 0;
        const paymentAmount = parseFloat(paymentInput.value) || 0;
        
        const newBalance = currentBalance + receiptAmount - paymentAmount;
        const newBalanceCell = document.querySelector(`.new-balance[data-employee="${employeeId}"]`);
        
        newBalanceCell.textContent = formatCurrency(newBalance);
        newBalanceCell.className = `new-balance ${newBalance >= 0 ? 'positive-balance' : 'negative-balance'}`;
    }
    
    function savePayments() {
        const date = document.getElementById('paymentDate').value;
        const receiptInputs = document.querySelectorAll('.receipt-input');
        const paymentInputs = document.querySelectorAll('.payment-input');
        
        let hasChanges = false;
        let paymentsToPrint = [];
        
        receiptInputs.forEach(input => {
            const amount = parseFloat(input.value);
            const employeeId = input.getAttribute('data-employee');
            const employee = employees.find(emp => emp.id === employeeId);
            
            if (amount && amount > 0) {
                const paymentRecord = {
                    id: generateId(),
                    date: date,
                    type: 'receipt',
                    employeeId: employeeId,
                    amount: amount
                };
                
                paymentRecords.push(paymentRecord);
                paymentsToPrint.push({
                    ...paymentRecord,
                    employeeName: employee.name
                });
                hasChanges = true;
                input.value = '';
            }
        });
        
        paymentInputs.forEach(input => {
            const amount = parseFloat(input.value);
            const employeeId = input.getAttribute('data-employee');
            const employee = employees.find(emp => emp.id === employeeId);
            
            if (amount && amount > 0) {
                const paymentRecord = {
                    id: generateId(),
                    date: date,
                    type: 'payment',
                    employeeId: employeeId,
                    amount: amount
                };
                
                paymentRecords.push(paymentRecord);
                paymentsToPrint.push({
                    ...paymentRecord,
                    employeeName: employee.name
                });
                hasChanges = true;
                input.value = '';
            }
        });
        
        if (hasChanges) {
            localStorage.setItem('payments', JSON.stringify(paymentRecords));
            showAlert('success', 'Payments saved successfully!');
            loadPaymentTable();
            loadPaymentHistory();
            loadEmployeeTable();
            updateDashboard();
            
            // Print receipts for payments
            if (paymentsToPrint.length > 0) {
                printReceipts(paymentsToPrint);
            }
        } else {
            showAlert('info', 'No payments to save');
        }
    }
    
    function printReceipts(payments) {
        // Create a print-friendly receipt
        const printWindow = window.open('', '_blank');
        const printContent = `
            <html>
                <head>
                    <title>Payment Receipts</title>
                    <style>
                        body { font-family: Arial, sans-serif; font-size: 12px; }
                        .receipt { width: 80mm; margin: 0 auto; padding: 10px; }
                        .header { text-align: center; margin-bottom: 10px; }
                        .title { font-weight: bold; font-size: 14px; }
                        .date { margin-bottom: 10px; }
                        .divider { border-top: 1px dashed #000; margin: 10px 0; }
                        .footer { text-align: center; margin-top: 20px; font-size: 10px; }
                        table { width: 100%; border-collapse: collapse; }
                        td { padding: 3px 0; }
                        .right { text-align: right; }
                        .center { text-align: center; }
                        .bold { font-weight: bold; }
                    </style>
                </head>
                <body>
                    ${payments.map(payment => `
                        <div class="receipt">
                            <div class="header">
                                <div class="title">AZY Employee Management</div>
                                <div>Payment Receipt</div>
                            </div>
                            <div class="divider"></div>
                            <div class="date">
                                <strong>Date:</strong> ${payment.date}<br>
                                <strong>Receipt No:</strong> ${payment.id}
                            </div>
                            <table>
                                <tr>
                                    <td><strong>Employee:</strong></td>
                                    <td class="right">${payment.employeeName}</td>
                                </tr>
                                <tr>
                                    <td><strong>Type:</strong></td>
                                    <td class="right">${payment.type === 'payment' ? 'Salary Payment' : 'Receipt'}</td>
                                </tr>
                                <tr>
                                    <td><strong>Amount:</strong></td>
                                    <td class="right bold">${formatCurrency(payment.amount)}</td>
                                </tr>
                            </table>
                            <div class="divider"></div>
                            <div class="footer">
                                Thank you for your business!<br>
                                Generated by AZY Employee Management
                            </div>
                        </div>
                        <div style="page-break-after: always;"></div>
                    `).join('')}
                </body>
            </html>
        `;
        
        printWindow.document.open();
        printWindow.document.write(printContent);
        printWindow.document.close();
        
        // Wait for content to load before printing
        printWindow.onload = function() {
            printWindow.print();
            printWindow.close();
        };
    }
    
    function loadPaymentHistory() {
        const tableBody = document.querySelector('#paymentHistoryTable tbody');
        tableBody.innerHTML = '';
        
        const filterDate = document.getElementById('filterPaymentDate').value;
        
        let filteredPayments = paymentRecords;
        
        if (filterDate) {
            filteredPayments = filteredPayments.filter(p => p.date === filterDate);
        }
        
        if (filteredPayments.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center">No records found</td></tr>';
            return;
        }
        
        // Sort by date (newest first)
        filteredPayments.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        filteredPayments.forEach(payment => {
            const employee = employees.find(emp => emp.id === payment.employeeId);
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td>${payment.date}</td>
                <td>${employee ? employee.name : 'Unknown'}</td>
                <td class="${payment.type === 'payment' ? 'negative-balance' : 'positive-balance'}">${formatCurrency(payment.amount)}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary edit-payment" data-id="${payment.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            `;
            
            tableBody.appendChild(row);
        });
        
        // Add event listeners to edit buttons
        document.querySelectorAll('.edit-payment').forEach(button => {
            button.addEventListener('click', function() {
                const paymentId = this.getAttribute('data-id');
                editPayment(paymentId);
            });
        });
    }
    
    function editPayment(paymentId) {
        const payment = paymentRecords.find(p => p.id === paymentId);
        if (!payment) return;
        
        document.getElementById('editPaymentId').value = payment.id;
        document.getElementById('editPaymentDate').value = payment.date;
        document.getElementById('editPaymentAmount').value = payment.amount;
        
        const modal = new bootstrap.Modal(document.getElementById('editPaymentModal'));
        modal.show();
    }
    
    function updatePaymentRecord() {
        const paymentId = document.getElementById('editPaymentId').value;
        const date = document.getElementById('editPaymentDate').value;
        const amount = parseFloat(document.getElementById('editPaymentAmount').value);
        
        if (!amount || amount <= 0) {
            showAlert('danger', 'Please enter a valid amount');
            return;
        }
        
        const paymentIndex = paymentRecords.findIndex(p => p.id === paymentId);
        if (paymentIndex === -1) return;
        
        paymentRecords[paymentIndex] = {
            ...paymentRecords[paymentIndex],
            date: date,
            amount: amount
        };
        
        localStorage.setItem('payments', JSON.stringify(paymentRecords));
        
        // Close modal
        bootstrap.Modal.getInstance(document.getElementById('editPaymentModal')).hide();
        
        // Refresh data
        loadPaymentHistory();
        loadPaymentTable();
        loadEmployeeTable();
        updateDashboard();
        
        showAlert('success', 'Payment updated successfully!');
    }
    
    function deletePaymentRecord() {
        const paymentId = passcodeActionData;
        
        paymentRecords = paymentRecords.filter(p => p.id !== paymentId);
        localStorage.setItem('payments', JSON.stringify(paymentRecords));
        
        // Close modals
        bootstrap.Modal.getInstance(document.getElementById('editPaymentModal')).hide();
        bootstrap.Modal.getInstance(document.getElementById('passcodeModal')).hide();
        
        // Refresh data
        loadPaymentHistory();
        loadPaymentTable();
        loadEmployeeTable();
        updateDashboard();
        
        showAlert('success', 'Payment deleted successfully!');
    }
    
    function loadEmployeeTable() {
        const tableBody = document.querySelector('#employeeTable tbody');
        tableBody.innerHTML = '';
        
        if (employees.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No employees found</td></tr>';
            return;
        }
        
        // Sort employees - active first
        const sortedEmployees = [...employees].sort((a, b) => {
            if (a.active === b.active) return a.name.localeCompare(b.name);
            return a.active ? -1 : 1;
        });
        
        sortedEmployees.forEach(employee => {
            const row = document.createElement('tr');
            const balance = calculateEmployeeBalance(employee.id);
            
            // Set row classes based on status
            if (!employee.active) {
                row.classList.add('table-secondary-light');
            } else if (balance >= 0) {
                row.classList.add('table-success-light');
            } else {
                row.classList.add('table-danger-light');
            }
            
            const balanceClass = balance >= 0 ? 'positive-balance' : 'negative-balance';
            
            row.innerHTML = `
                <td>${employee.id}</td>
                <td>${employee.nic}</td>
                <td>${employee.name}</td>
                <td>${formatCurrency(employee.dailySalary)}</td>
                <td class="${balanceClass}">${formatCurrency(balance)}</td>
                <td><span class="badge ${employee.active ? 'badge-active' : 'badge-inactive'}">${employee.active ? 'Active' : 'Inactive'}</span></td>
                <td>
                    <button class="btn btn-sm btn-outline-primary edit-employee" data-id="${employee.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            `;
            
            tableBody.appendChild(row);
        });
        
        // Add event listeners to edit buttons
        document.querySelectorAll('.edit-employee').forEach(button => {
            button.addEventListener('click', function() {
                const employeeId = this.getAttribute('data-id');
                editEmployee(employeeId);
            });
        });
        
        updateDashboard();
    }
    
    function editEmployee(employeeId) {
        const employee = employees.find(emp => emp.id === employeeId);
        if (!employee) return;
        
        document.getElementById('employeeId').value = employee.id;
        document.getElementById('employeeNic').value = employee.nic;
        document.getElementById('employeeName').value = employee.name;
        document.getElementById('employeeSalary').value = employee.dailySalary;
        document.getElementById('employeeOpeningBalance').value = employee.openingBalance || 0;
        document.getElementById('employeeActive').checked = employee.active;
    }
    
    function saveEmployee(e) {
        e.preventDefault();
        
        const form = document.getElementById('employeeForm');
        if (!form.checkValidity()) {
            form.classList.add('was-validated');
            return;
        }
        
        const id = document.getElementById('employeeId').value;
        const nic = document.getElementById('employeeNic').value;
        const name = document.getElementById('employeeName').value;
        const salary = parseFloat(document.getElementById('employeeSalary').value);
        const openingBalance = parseFloat(document.getElementById('employeeOpeningBalance').value) || 0;
        const active = document.getElementById('employeeActive').checked;
        
        // Check for duplicate NIC (except for the same employee)
        const duplicateNic = employees.find(emp => emp.nic === nic && emp.id !== id);
        if (duplicateNic) {
            showAlert('danger', 'An employee with this NIC already exists');
            return;
        }
        
        if (id) {
            // Update existing employee
            const index = employees.findIndex(emp => emp.id === id);
            if (index !== -1) {
                // Store the original salary if it's being changed and hasn't been stored before
                const originalSalary = employees[index].dailySalary;
                const salaryIsChanging = salary !== originalSalary;
                
                employees[index] = {
                    ...employees[index],
                    nic: nic,
                    name: name,
                    dailySalary: salary,
                    openingBalance: openingBalance,
                    active: active,
                    // Store the original salary if it's being changed for the first time
                    originalSalary: salaryIsChanging && !employees[index].originalSalary ? 
                        originalSalary : 
                        employees[index].originalSalary
                };
            }
        } else {
            // Add new employee
            const newId = generateEmployeeId();
            employees.push({
                id: newId,
                nic: nic,
                name: name,
                dailySalary: salary,
                openingBalance: openingBalance,
                active: active,
                originalSalary: null // No original salary for new employees
            });
        }
        
        localStorage.setItem('employees', JSON.stringify(employees));
        
        // Refresh data
        clearEmployeeForm();
        loadEmployeeTable();
        loadPaymentTable();
        updateDashboard();
        
        showAlert('success', 'Employee saved successfully!');
    }
    
    function calculateEmployeeBalance(employeeId) {
        const employee = employees.find(emp => emp.id === employeeId);
        if (!employee) return 0;
        
        // Calculate balance
        let balance = employee.openingBalance || 0;
        
        // Get all attendance records for this employee
        for (const dateKey in attendanceRecords) {
            if (attendanceRecords[dateKey][employeeId]) {
                const status = attendanceRecords[dateKey][employeeId];
                
                // Determine which salary to use (original or current)
                let salaryToUse = employee.dailySalary;
                if (employee.originalSalary !== null && dateKey < today) {
                    salaryToUse = employee.originalSalary;
                }
                
                if (status === 'present') {
                    balance += salaryToUse;
                } else if (status === 'halfday') {
                    balance += salaryToUse / 2;
                }
            }
        }
        
        // Subtract payments and add receipts
        paymentRecords.forEach(payment => {
            if (payment.employeeId === employeeId) {
                if (payment.type === 'payment') {
                    balance -= payment.amount;
                } else {
                    balance += payment.amount;
                }
            }
        });
        
        return balance;
    }
    
    function clearEmployeeForm() {
        document.getElementById('employeeForm').reset();
        document.getElementById('employeeForm').classList.remove('was-validated');
        document.getElementById('employeeId').value = '';
        document.getElementById('employeeOpeningBalance').value = 0;
    }
    
    function savePasscode() {
        const passcode = document.getElementById('systemPasscode').value;
        const confirmPasscode = document.getElementById('confirmPasscode').value;
        
        if (passcode && passcode !== confirmPasscode) {
            showAlert('danger', 'Passcodes do not match');
            return;
        }
        
        if (passcode && passcode.length !== 4) {
            showAlert('danger', 'Passcode must be 4 digits');
            return;
        }
        
        if (passcode) {
            systemSettings.passcode = passcode;
            localStorage.setItem('settings', JSON.stringify(systemSettings));
            
            document.getElementById('systemPasscode').value = '';
            document.getElementById('confirmPasscode').value = '';
            showAlert('success', 'Passcode saved successfully!');
        } else {
            showAlert('info', 'No passcode entered');
        }
    }
    
    function saveCurrency() {
        const currency = document.getElementById('systemCurrency').value;
        systemSettings.currency = currency;
        localStorage.setItem('settings', JSON.stringify(systemSettings));
        
        updateCurrencySymbols();
        showAlert('success', 'Currency saved successfully!');
    }
    
    function createBackup() {
        const backupData = {
            employees: employees,
            attendance: attendanceRecords,
            payments: paymentRecords,
            settings: systemSettings,
            backupDate: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Attendance_${today}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showAlert('success', 'Backup created successfully!');
    }
    
    function restoreBackup() {
        const fileInput = document.getElementById('restoreBackupFile');
        const file = fileInput.files[0];
        
        if (!file) {
            showAlert('danger', 'Please select a backup file');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const backupData = JSON.parse(e.target.result);
                
                if (!confirm('This will overwrite all current data. Are you sure?')) {
                    return;
                }
                
                employees = backupData.employees || [];
                attendanceRecords = backupData.attendance || {};
                paymentRecords = backupData.payments || [];
                systemSettings = backupData.settings || { currency: 'LKR', passcode: '1234', theme: 'light' };
                
                localStorage.setItem('employees', JSON.stringify(employees));
                localStorage.setItem('attendance', JSON.stringify(attendanceRecords));
                localStorage.setItem('payments', JSON.stringify(paymentRecords));
                localStorage.setItem('settings', JSON.stringify(systemSettings));
                
                // Refresh UI
                document.getElementById('systemCurrency').value = systemSettings.currency;
                
                // Apply theme
                if (systemSettings.theme === 'dark') {
                    document.body.classList.add('dark-theme');
                    document.getElementById('darkTheme').checked = true;
                } else {
                    document.body.classList.remove('dark-theme');
                    document.getElementById('lightTheme').checked = true;
                }
                
                updateCurrencySymbols();
                loadAttendanceTable();
                loadPaymentTable();
                loadEmployeeTable();
                updateDashboard();
                
                fileInput.value = '';
                showAlert('success', 'Backup restored successfully!');
            } catch (error) {
                showAlert('danger', 'Invalid backup file');
                console.error(error);
            }
        };
        reader.readAsText(file);
    }
    
    function updateCurrencySymbols() {
        const currency = systemSettings.currency;
        document.querySelectorAll('.currency-symbol').forEach(el => {
            el.textContent = currency;
        });
    }
    
    function updateDashboard() {
        // Total Employees
        document.getElementById('totalEmployees').textContent = employees.filter(e => e.active).length;
        
        // Today Present
        const todayKey = formatDateKey(today);
        const todayAttendance = attendanceRecords[todayKey] || {};
        let presentCount = 0;
        
        employees.forEach(emp => {
            if (emp.active && todayAttendance[emp.id] === 'present') {
                presentCount++;
            }
        });
        
        document.getElementById('todayPresent').textContent = presentCount;
        
        // Total Paid
        const totalPaid = paymentRecords
            .filter(p => p.type === 'payment')
            .reduce((sum, p) => sum + p.amount, 0);
        
        document.getElementById('totalPaid').textContent = formatCurrency(totalPaid);
        
        // Total Due
        let totalDue = 0;
        employees.forEach(emp => {
            if (emp.active) {
                const balance = calculateEmployeeBalance(emp.id);
                if (balance > 0) {
                    totalDue += balance;
                }
            }
        });
        
        document.getElementById('totalDue').textContent = formatCurrency(totalDue);
    }
    
    function loadReportEmployeeOptions() {
        const select = document.getElementById('reportEmployee');
        select.innerHTML = '<option value="all">All Employees</option>';
        
        employees.forEach(employee => {
            const option = document.createElement('option');
            option.value = employee.id;
            option.textContent = `${employee.name} (${employee.id})`;
            select.appendChild(option);
        });
        
        // Set default date range (last 30 days)
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        document.getElementById('reportFromDate').value = thirtyDaysAgo.toISOString().split('T')[0];
        document.getElementById('reportToDate').value = today.toISOString().split('T')[0];
    }
    
    function generateReport() {
        const employeeId = document.getElementById('reportEmployee').value;
        const fromDate = document.getElementById('reportFromDate').value;
        const toDate = document.getElementById('reportToDate').value;
        
        if (!fromDate || !toDate) {
            showAlert('danger', 'Please select both date range values');
            return;
        }
        
        const reportData = prepareReportData(employeeId, fromDate, toDate);
        renderReportTable(reportData);
    }
    
    function prepareReportData(employeeId, fromDate, toDate) {
        const reportData = [];
        const filteredEmployees = employeeId === 'all' 
            ? employees 
            : employees.filter(emp => emp.id === employeeId);
        
        filteredEmployees.forEach(employee => {
            // Add opening balance entry
            if (employee.openingBalance) {
                reportData.push({
                    date: fromDate,
                    employeeId: employee.id,
                    employeeName: employee.name,
                    description: 'Opening Balance',
                    credit: employee.openingBalance > 0 ? employee.openingBalance : 0,
                    debit: employee.openingBalance < 0 ? Math.abs(employee.openingBalance) : 0,
                    balance: employee.openingBalance
                });
            }
            
            // Process attendance records
            for (const dateKey in attendanceRecords) {
                if (dateKey >= fromDate && dateKey <= toDate && attendanceRecords[dateKey][employee.id]) {
                    const status = attendanceRecords[dateKey][employee.id];
                    
                    // Determine which salary to use (original or current)
                    let salaryToUse = employee.dailySalary;
                    if (employee.originalSalary !== null && dateKey < today) {
                        salaryToUse = employee.originalSalary;
                    }
                    
                    let amount = 0;
                    let description = '';
                    
                    if (status === 'present') {
                        amount = salaryToUse;
                        description = 'Attendance - Present';
                    } else if (status === 'halfday') {
                        amount = salaryToUse / 2;
                        description = 'Attendance - Half Day';
                    }
                    
                    if (amount > 0) {
                        reportData.push({
                            date: dateKey,
                            employeeId: employee.id,
                            employeeName: employee.name,
                            description: description,
                            credit: amount,
                            debit: 0,
                            balance: 0 // Will be calculated later
                        });
                    }
                }
            }
            
            // Process payment records
            paymentRecords.forEach(payment => {
                if (payment.employeeId === employee.id && payment.date >= fromDate && payment.date <= toDate) {
                    reportData.push({
                        date: payment.date,
                        employeeId: employee.id,
                        employeeName: employee.name,
                        description: payment.type === 'payment' ? 'Salary Payment' : 'Receipt',
                        credit: payment.type === 'receipt' ? payment.amount : 0,
                        debit: payment.type === 'payment' ? payment.amount : 0,
                        balance: 0 // Will be calculated later
                    });
                }
            });
        });
        
        // Sort by date and employee
        reportData.sort((a, b) => {
            if (a.date === b.date) {
                return a.employeeName.localeCompare(b.employeeName);
            }
            return a.date.localeCompare(b.date);
        });
        
        // Calculate running balance
        let runningBalances = {};
        filteredEmployees.forEach(emp => {
            runningBalances[emp.id] = emp.openingBalance || 0;
        });
        
        reportData.forEach(entry => {
            if (entry.description !== 'Opening Balance') {
                runningBalances[entry.employeeId] += entry.credit - entry.debit;
            }
            entry.balance = runningBalances[entry.employeeId];
        });
        
        return reportData;
    }
    
    function renderReportTable(reportData) {
        const tableBody = document.querySelector('#reportTable tbody');
        tableBody.innerHTML = '';
        
        if (reportData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No records found for the selected criteria</td></tr>';
            return;
        }
        
        reportData.forEach(entry => {
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td>${entry.date}</td>
                <td>${entry.employeeName}</td>
                <td>${entry.description}</td>
                <td class="${entry.credit > 0 ? 'positive-balance' : ''}">${entry.credit > 0 ? formatCurrency(entry.credit) : ''}</td>
                <td class="${entry.debit > 0 ? 'negative-balance' : ''}">${entry.debit > 0 ? formatCurrency(entry.debit) : ''}</td>
                <td class="${entry.balance >= 0 ? 'positive-balance' : 'negative-balance'}">${formatCurrency(entry.balance)}</td>
            `;
            
            tableBody.appendChild(row);
        });
    }
    
    function exportReportToCSV() {
        const employeeId = document.getElementById('reportEmployee').value;
        const fromDate = document.getElementById('reportFromDate').value;
        const toDate = document.getElementById('reportToDate').value;
        
        if (!fromDate || !toDate) {
            showAlert('danger', 'Please generate a report first');
            return;
        }
        
        const reportData = prepareReportData(employeeId, fromDate, toDate);
        
        if (reportData.length === 0) {
            showAlert('info', 'No data to export');
            return;
        }
        
        // CSV header
        let csv = 'Date,Employee,Description,Credit,Debit,Balance\n';
        
        // CSV rows
        reportData.forEach(entry => {
            csv += `"${entry.date}","${entry.employeeName}","${entry.description}",`;
            csv += `"${entry.credit > 0 ? entry.credit.toFixed(2) : ''}","${entry.debit > 0 ? entry.debit.toFixed(2) : ''}",`;
            csv += `"${entry.balance.toFixed(2)}"\n`;
        });
        
        // Create download link
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Employee_Report_${fromDate}_to_${toDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showAlert('success', 'Report exported successfully!');
    }
    
    function requestPasscode(action) {
        currentPasscodeAction = action;
        
        // For deletePayment, we set the data in the editPayment function
        if (action === 'deletePayment') {
            passcodeActionData = document.getElementById('editPaymentId').value;
        }
        
        document.getElementById('inputPasscode').value = '';
        document.getElementById('passcodeError').classList.add('d-none');
        
        const modal = new bootstrap.Modal(document.getElementById('passcodeModal'));
        modal.show();
    }
    
    function verifyPasscode() {
        const inputPasscode = document.getElementById('inputPasscode').value;
        const passcodeError = document.getElementById('passcodeError');
        
        if (inputPasscode.length !== 4) {
            passcodeError.textContent = 'Passcode must be 4 digits';
            passcodeError.classList.remove('d-none');
            return;
        }
        
        if (inputPasscode !== systemSettings.passcode) {
            passcodeError.textContent = 'Incorrect passcode. Please try again.';
            passcodeError.classList.remove('d-none');
            return;
        }
        
        // Passcode is correct
        bootstrap.Modal.getInstance(document.getElementById('passcodeModal')).hide();
        
        switch (currentPasscodeAction) {
            case 'changeDate':
                document.getElementById('attendanceDate').readOnly = false;
                document.getElementById('attendanceDate').focus();
                showAlert('success', 'Date field unlocked. Changes will be temporary until saved.');
                break;
                
            case 'editAttendance':
                editAttendance();
                break;
                
            case 'deletePayment':
                deletePaymentRecord();
                break;
                
            case 'restoreBackup':
                restoreBackup();
                break;
        }
    }
    
    // Helper functions
    function formatDateKey(dateString) {
        return dateString; // YYYY-MM-DD format is already good as a key
    }
    
    function formatCurrency(amount) {
        return `${systemSettings.currency} ${amount.toFixed(2)}`;
    }
    
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    function generateEmployeeId() {
        const maxId = employees.reduce((max, emp) => {
            const num = parseInt(emp.id);
            return num > max ? num : max;
        }, 0);
        
        return (maxId + 1).toString().padStart(4, '0');
    }
    
    function showAlert(type, message) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 end-0 m-3`;
        alertDiv.style.zIndex = '1100';
        alertDiv.role = 'alert';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        document.body.appendChild(alertDiv);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            const bsAlert = new bootstrap.Alert(alertDiv);
            bsAlert.close();
        }, 3000);
    }
});