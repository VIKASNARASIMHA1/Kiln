# Evaluation and overfitting

Accuracy is the share of correct predictions, but it misleads on imbalanced data. Precision is how many predicted positives were correct. Recall is how many real positives were found. The F1 score balances the two. AUC measures how well a classifier ranks positives above negatives.

Overfitting happens when a model memorises the training data and performs worse on new data. Signs are high training accuracy with low test accuracy. Remedies include more data, simpler models, regularisation and early stopping. Cross-validation repeats the train and test split several times for a more reliable estimate.
