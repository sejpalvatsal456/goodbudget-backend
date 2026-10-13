export const validateName = (name) => {
    // name should be non empty string with atmost 60 characters (as in the limit in table schema itself)
    return !(name.trim() === "") && name.trim().length <= 60;
};
export const validateEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
};
export const validatePassword = (password) => {
    // password should be non empty string and follows the following style -
    // 1. Atleast 8 character long        ==> .{8,}
    // 2. Atleast one uppercase letter    ==> (?=.*[A-Z])
    // 3. Atleast one numeric letter      ==> (?=.*\d)
    // 4. Atleast one special character   ==> (?=.*[\W_])
    // regex - ^(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$
    const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    return regex.test(password);
};
export const validateUsername = (username) => {
    // username should be a non empty string and follows the following style - 
    // 1. allows lowercase only alphabets
    // 2. allows numeric characters
    // 3. allows . _ only from special characters also they can't be in first characters
    // regex - ^[^._](?=.*[a-z0-9])[a-z0-9._]+$
    const regex = /^[a-z0-9][a-z0-9._]*$/;
    return regex.test(username);
};
export const validateBalance = (balance) => {
    return balance >= 0;
};
export const validateAccountType = (acc_type) => {
    const validTypes = ['current', 'saving', 'cash', 'credit_card'];
    return validTypes.includes(acc_type);
};
export const validateDate = (date) => {
    return !Number.isNaN(Date.parse(date));
};
export const validateTransactionType = (tran_type) => {
    const validTypes = ['income', 'expense'];
    return validTypes.includes(tran_type);
};
export const validateTransactionMode = (tran_type) => {
    const validTypes = ['cash', 'online', 'credit_card'];
    return validTypes.includes(tran_type);
};
export const validateTransactionStatus = (tran_type) => {
    const validTypes = ['pending', 'completed', 'failed'];
    return validTypes.includes(tran_type);
};
